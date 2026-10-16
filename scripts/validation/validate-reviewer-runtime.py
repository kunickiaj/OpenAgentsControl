#!/usr/bin/env python3
"""Check reviewer parsing with an isolated OpenCode V2 CLI; never invoke a model."""

import fnmatch
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.parse import quote


REPO = Path(__file__).resolve().parents[2]
PROMPTS = {
    "CodeReviewer": "reviewer.md",
    "AdversarialReviewer": "adversarial-reviewer.md",
}
TIMEOUT_SECONDS = 60
READY_TIMEOUT_SECONDS = 15


class AgentNotReady(AssertionError):
    """The isolated service has not registered the requested agent yet."""


def run_cli(executable, arguments, *, project, env, timeout=TIMEOUT_SECONDS):
    """Capture output without exposing unrelated runtime configuration on failure."""
    try:
        result = subprocess.run(
            [executable, *arguments],
            cwd=project,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise AssertionError(
            f"OpenCode CLI exceeded its {timeout:g}-second timeout"
        ) from None
    if result.returncode:
        try:
            error = json.loads(result.stdout)
        except json.JSONDecodeError:
            error = None
        if isinstance(error, dict) and error.get("_tag") == "AgentNotFoundError":
            raise AgentNotReady("Copied reviewer is not registered yet")
        raise AssertionError(f"OpenCode CLI failed with exit code {result.returncode}")
    return result.stdout


def permission_effect(rules, action, resource):
    """Evaluate these simple wildcard probes using documented last-match rules."""
    for rule in reversed(rules):
        if fnmatch.fnmatchcase(action, rule["action"]) and fnmatch.fnmatchcase(
            resource, rule["resource"]
        ):
            return rule["effect"]
    raise AssertionError(f"No active permission rule matched {action}")


class ReviewerRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Resolve before isolation, and do not execute a tool-manager shim.
        executable = shutil.which("opencode")
        if executable is None:
            raise AssertionError("This check requires an installed OpenCode V2 CLI")
        cls.executable = str(Path(executable).resolve())
        if Path(cls.executable).name in {"mise", "asdf"}:
            raise AssertionError(
                "Put the actual OpenCode executable on PATH, not a shim"
            )

        cls.temp = tempfile.TemporaryDirectory(prefix="reviewer-runtime-")
        cls.addClassCleanup(cls.temp.cleanup)
        root = cls.root = Path(cls.temp.name).resolve()
        cls.project = root / "project"
        cls.env = {"PATH": os.defpath}
        directories = {
            "HOME": "home",
            "XDG_CONFIG_HOME": "config",
            "XDG_DATA_HOME": "data",
            "XDG_STATE_HOME": "state",
            "XDG_CACHE_HOME": "cache",
            "XDG_RUNTIME_DIR": "runtime",
            "TMPDIR": "tmp",
        }
        for variable, directory in directories.items():
            target = root / directory
            target.mkdir(mode=0o700)
            cls.env[variable] = str(target)
        cls.install_fixture()
        cls.verify_cli_paths()
        # unittest cleanups are LIFO: stop this service before deleting its home,
        # including when startup or any later setUpClass step fails.
        cls.addClassCleanup(cls.stop_service)
        cls.start_service()
        cls.verify_service_identity()
        cls.load_agents()

    @classmethod
    def install_fixture(cls):
        agents = cls.project / ".opencode" / "agents"
        agents.mkdir(parents=True)
        cls.bodies = {}
        for agent, filename in PROMPTS.items():
            source = REPO / ".opencode/agent/subagents/code" / filename
            target = agents / f"{agent}.md"
            shutil.copyfile(source, target)
            match = re.match(
                r"\A---\r?\n.*?\r?\n---\r?\n(.*)\Z", target.read_text(), re.S
            )
            if match is None:
                raise AssertionError(f"{agent} is missing prompt frontmatter")
            cls.bodies[agent] = match[1].strip()
        config = Path(cls.env["XDG_CONFIG_HOME"]) / "opencode"
        config.mkdir()
        (config / "opencode.json").write_text(
            json.dumps(
                {
                    "update": "disable",
                    "permissions": [
                        {"action": "shell", "resource": "*", "effect": "allow"},
                        {
                            "action": "shell",
                            "resource": "git push --force*",
                            "effect": "ask",
                        },
                        {"action": "shell", "resource": "rm -rf*", "effect": "ask"},
                    ],
                }
            )
        )

    @classmethod
    def verify_cli_paths(cls):
        options = {"project": cls.project, "env": cls.env}
        version = run_cli(cls.executable, ["--version"], **options).strip()
        match = re.fullmatch(r"(?:opencode v)?(2\.\d+\.\d+(?:[-+][\w.-]+)?)", version)
        if match is None:
            raise AssertionError("This check requires an OpenCode V2 version response")
        cls.version = match[1]
        print(f"OpenCode runtime: {cls.version}", flush=True)
        cls.paths = {}
        for name in ("home", "config", "data", "state", "cache", "tmp", "db"):
            output = run_cli(cls.executable, ["debug", "paths", name], **options)
            path = Path(output.strip()).resolve()
            if not path.is_relative_to(cls.root):
                raise AssertionError(
                    f"OpenCode {name} path escaped temporary isolation"
                )
            cls.paths[name] = path

    @classmethod
    def start_service(cls):
        options = {"project": cls.project, "env": cls.env}
        # Managed services require a positive port; do not collide with the
        # user's fixed default. Reserve a loopback port while writing config.
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            cls.service_port = reservation.getsockname()[1]
            run_cli(
                cls.executable,
                ["service", "set", "port", str(cls.service_port)],
                **options,
            )
            run_cli(
                cls.executable, ["service", "set", "hostname", "127.0.0.1"], **options
            )
        run_cli(cls.executable, ["service", "start"], **options)

    @classmethod
    def verify_service_identity(cls):
        registration = cls.paths["state"] / "service.json"
        record = json.loads(registration.read_text())
        cls.service_pid = record.get("pid")
        if type(cls.service_pid) is not int or cls.service_pid <= 0:
            raise AssertionError("Temporary service registration has no valid PID")
        output = run_cli(
            cls.executable,
            ["api", "get", "/api/info"],
            project=cls.project,
            env=cls.env,
        )
        info = json.loads(output)
        if info.get("pid") != cls.service_pid or info.get("version") != cls.version:
            raise AssertionError(
                "API did not connect to the registered temporary service"
            )
        if not Path(info["paths"]["tmp"]).resolve().is_relative_to(cls.root):
            raise AssertionError("API service temporary path escaped isolation")

    @classmethod
    def stop_service(cls):
        run_cli(cls.executable, ["service", "stop"], project=cls.project, env=cls.env)

    @classmethod
    def read_agent_when_ready(cls, agent, path):
        deadline = time.monotonic() + READY_TIMEOUT_SECONDS
        for attempt in range(3):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError(
                    f"{agent} registration exceeded {READY_TIMEOUT_SECONDS} seconds"
                )
            try:
                return run_cli(
                    cls.executable,
                    ["api", "get", path],
                    project=cls.project,
                    env=cls.env,
                    timeout=remaining,
                )
            except AgentNotReady:
                if attempt == 2 or time.monotonic() >= deadline:
                    raise AssertionError(
                        f"{agent} was not registered after at most 3 lookups "
                        f"within {READY_TIMEOUT_SECONDS} seconds"
                    ) from None
                print(
                    f"{agent}: waiting for agent registration (retry {attempt + 1}/2)",
                    flush=True,
                )
                time.sleep(min(0.2, max(0, deadline - time.monotonic())))

    @classmethod
    def load_agents(cls):
        cls.agents = {}
        for agent in PROMPTS:
            # api otherwise defaults to HOME, not the subprocess working directory.
            path = (
                f"/api/agent/{quote(agent, safe='')}?location%5Bdirectory%5D="
                f"{quote(str(cls.project), safe='')}"
            )
            output = cls.read_agent_when_ready(agent, path)
            try:
                response = json.loads(output)
            except json.JSONDecodeError:
                raise AssertionError(f"{agent}: API did not return JSON") from None
            if not isinstance(response, dict) or not isinstance(
                response.get("data"), dict
            ):
                raise AssertionError(
                    f"{agent}: expected the API location/data envelope"
                )
            location = response.get("location", {})
            if Path(location.get("directory", "")).resolve() != cls.project:
                raise AssertionError(
                    f"{agent}: API location differs from temporary project"
                )
            if response["data"].get("id") != agent:
                raise AssertionError(f"{agent}: API returned a different agent ID")
            cls.agents[agent] = response["data"]

    def test_copied_prompt_is_the_active_system_prompt(self):
        # Arrange: expected bodies come from the copied real prompt files.
        for agent, expected in self.bodies.items():
            with self.subTest(agent=agent):
                # Act
                actual = self.agents[agent].get("system", "").strip()
                # Assert: a wrong location or parser path must not silently pass.
                self.assertTrue(
                    actual == expected, "Active system differs from copied prompt"
                )

    def test_native_permissions_are_active_not_provider_request_data(self):
        # Arrange: legacy frontmatter once moved permissions into request.body.
        for agent, info in self.agents.items():
            with self.subTest(agent=agent):
                # Act
                rules = info.get("permissions")
                body = info.get("request", {}).get("body", {})
                # Assert: check only targeted fields; never print the request body.
                self.assertIsInstance(rules, list, "Native permissions are not active")
                self.assertTrue(bool(rules), "Native permissions are empty")
                self.assertFalse(
                    "permissions" in body, "Permissions leaked into request.body"
                )

    def test_edits_are_denied_for_project_and_external_paths(self):
        # Arrange: inspect decisions only; never request a write or patch.
        paths = (
            "src/example.ts",
            str(self.project / "src/example.ts"),
            "/outside/file",
            ".env",
        )
        for agent, info in self.agents.items():
            for path in paths:
                with self.subTest(agent=agent, path=path):
                    # Act
                    effect = permission_effect(info["permissions"], "edit", path)
                    # Assert
                    self.assertEqual(effect, "deny")

    def test_contextscout_exception_does_not_allow_unrelated_delegation(self):
        # Arrange: include both flat and path-qualified public ContextScout IDs.
        scouts = ("ContextScout", "contextscout", "subagents/core/contextscout")
        for agent, info in self.agents.items():
            for target in (
                *scouts,
                "CoderAgent",
                "CodeReviewer",
                "NotContextScout",
                "unrelated-agent",
            ):
                with self.subTest(agent=agent, target=target):
                    expected = "deny"
                    if agent == "CodeReviewer" and target in scouts:
                        expected = "allow"
                    # Act
                    effect = permission_effect(info["permissions"], "subagent", target)
                    # Assert: AdversarialReviewer has no delegation exception.
                    self.assertEqual(effect, expected)

    def test_shell_inherits_inspection_allow_and_destructive_ask(self):
        # Arrange: these strings are probes, never shell commands to execute.
        probes = {
            "git diff --stat": "allow",
            "git push --force origin main": "ask",
            "rm -rf example-directory": "ask",
        }
        for agent, info in self.agents.items():
            for command, expected in probes.items():
                with self.subTest(agent=agent, command=command):
                    # Act
                    effect = permission_effect(info["permissions"], "shell", command)
                    # Assert: no agent blanket allow/deny may replace global rules.
                    self.assertEqual(effect, expected)


if __name__ == "__main__":
    unittest.main()

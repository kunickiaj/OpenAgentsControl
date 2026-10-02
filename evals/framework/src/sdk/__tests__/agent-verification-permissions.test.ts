import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

type Action = 'allow' | 'ask' | 'deny';
type Rules = Record<string, Action>;
type AgentFrontmatter = {
  name: string;
  permission: { bash: Rules; edit: Rules };
};

const INSTALLED_JAVA_VERIFICATION_COMMANDS = [
  'mvn --offline test',
  'mvn --offline verify',
  'mvn -o test',
  'mvn -o verify',
  'gradle --offline test',
  'gradle --offline check',
];

const JAVA_WRAPPER_COMMANDS = [
  './mvnw --offline test',
  './mvnw --offline verify',
  './mvnw -o test',
  './mvnw -o verify',
  './gradlew --offline test',
  './gradlew --offline check',
];

const JAVA_VERIFICATION_COMMANDS = [
  ...INSTALLED_JAVA_VERIFICATION_COMMANDS,
  ...JAVA_WRAPPER_COMMANDS,
];

function loadAgent(filename: string): AgentFrontmatter {
  const source = readFileSync(
    new URL(`../../../../../.opencode/agent/subagents/code/${filename}.md`, import.meta.url),
    'utf8'
  );
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!frontmatter) throw new Error(`Missing YAML frontmatter: ${filename}`);
  return parseYaml(frontmatter[1]) as AgentFrontmatter;
}

// Model ordered OpenCode wildcards, including the bare-command " *" exception.
// This is a policy regression model, not the runtime shell parser or a sandbox.
function matchesPattern(pattern: string, value: string): boolean {
  const optionalArguments = pattern.endsWith(' *');
  const base = optionalArguments ? pattern.slice(0, -2) : pattern;
  const expression = base
    .split('*')
    .map(part => part.replace(/[|\\{}()[\]^$+.]/g, '\\$&').replace(/\?/g, '.'))
    .join('.*');
  const suffix = optionalArguments ? '( .*)?' : '';
  return new RegExp(`^${expression}${suffix}$`, 's').test(value);
}

function resolveRule(rules: Rules, value: string): Action | undefined {
  return Object.entries(rules).reduce<Action | undefined>(
    (action, [pattern, next]) => matchesPattern(pattern, value) ? next : action,
    undefined
  );
}

describe('ordered permission matching contract', () => {
  it.each([
    { rules: { '*': 'deny', 'pnpm test *': 'allow' }, command: 'pnpm test file.test.ts', expected: 'allow' },
    { rules: { '*': 'deny', 'pnpm test *': 'allow' }, command: 'pnpm test', expected: 'allow' },
    { rules: { '*': 'deny', 'pnpm test *': 'allow' }, command: 'pnpm testing', expected: 'deny' },
    { rules: { 'pnpm test *': 'allow', '*': 'deny' }, command: 'pnpm test', expected: 'deny' },
    { rules: { '*': 'deny', 'pnpm run fix -- *': 'allow', 'pnpm run fix --': 'deny' }, command: 'pnpm run fix -- touched.ts', expected: 'allow' },
    { rules: { '*': 'deny', 'pnpm run fix -- *': 'allow', 'pnpm run fix --': 'deny' }, command: 'pnpm run fix --', expected: 'deny' },
    { rules: { 'node --test file.test.ts': 'allow' }, command: 'node --test file.test.ts', expected: 'allow' },
    { rules: { 'node --test file.test.ts': 'allow' }, command: 'node --test fileXtestYts', expected: undefined },
    { rules: { 'git * *': 'allow' }, command: 'git status', expected: 'allow' },
    { rules: { 'git * *': 'allow' }, command: 'gitstatus', expected: undefined },
    { rules: { 'node --test file?.test.ts': 'allow' }, command: 'node --test file1.test.ts', expected: 'allow' },
    { rules: { 'node --test file?.test.ts': 'allow' }, command: 'node --test file12.test.ts', expected: undefined },
  ] as { rules: Rules; command: string; expected: Action | undefined }[])(
    'resolves $command to $expected with ordered rules $rules',
    ({ rules, command, expected }) => {
      // Arrange: explicit ordering distinguishes last-match from first-match.
      const orderedRules = rules;

      // Act
      const action = resolveRule(orderedRules, command);

      // Assert
      expect(action).toBe(expected);
    }
  );
});

describe.each([
  ['CoderAgent', 'coder-agent'],
  ['TestEngineer', 'test-engineer'],
])('%s source verification permissions', (name, filename) => {
  it('loads the actual source YAML with a default shell denial', () => {
    // Arrange
    const agent = loadAgent(filename);

    // Act
    const policy = { name: agent.name, defaultAction: agent.permission.bash['*'] };

    // Assert
    expect(policy).toEqual({ name, defaultAction: 'deny' });
  });

  // These strings are matched only; none of the commands below is executed.
  it.each([
    'pnpm exec vitest run src/sdk/__tests__/agent-frontmatter.test.ts',
    'pnpm exec tsc --project tsconfig.json --noEmit',
    'pnpm exec biome check touched.ts',
    'pnpm run fix -- touched.ts',
    'node --test file.test.js',
    'node --test test-routing.test.mjs',
    'npx --no-install vitest run file.test.ts',
    'pnpm exec jest file.test.ts',
    'npx --no-install jest file.test.ts',
    'cargo test --offline',
    'git status --short --branch',
    'git diff --no-ext-diff --no-textconv -- touched.ts',
    'git show --no-ext-diff --no-textconv HEAD',
    'git log --no-ext-diff --no-textconv -1',
    'git rev-parse --show-toplevel',
    'git ls-files -- touched.ts',
    'pnpm test',
    'pnpm run test',
    'node --test',
    'git status',
    'git diff --no-ext-diff --no-textconv',
    'mypy',
    'mypy src/touched.py --strict',
    'pyright',
    'pyright src/touched.py',
    'ruff check touched.py --fix',
    'ruff format touched.py',
    'pytest tests/test_example.py',
    'python -m pytest tests/test_example.py',
    'python3 -m pytest tests/test_example.py',
    'terraform validate',
    'terraform validate -no-color',
    'terraform fmt -check',
    'terraform fmt -check -recursive',
    'terraform fmt -check -recursive modules/example',
    'terraform fmt main.tf',
    'terraform fmt modules/example/main.tf',
    ...INSTALLED_JAVA_VERIFICATION_COMMANDS,
  ])('allows local verification or read-only inspection: %s', command => {
    // Arrange: read source rules, not a copied allowlist.
    const rules = loadAgent(filename).permission.bash;

    // Act
    const action = resolveRule(rules, command);

    // Assert
    expect(action).toBe('allow');
  });

  it.each([
    ...JAVA_WRAPPER_COMMANDS,
    'go test',
    'go test ./...',
    'bun test',
    'bun test file.test.ts',
  ])('requires approval for commands that may download tools or dependencies: %s', command => {
    // Arrange
    const rules = loadAgent(filename).permission.bash;

    // Act
    const action = resolveRule(rules, command);

    // Assert
    expect(action).toBe('ask');
  });

  it.each([
    'node --test --import ./hook.mjs file.test.js',
    'node --test file.test.js --import=./hook.mjs',
    'node --test --require ./hook.cjs file.test.js',
    'node --test file.test.js --require=./hook.cjs',
    'node --test -r ./hook.cjs file.test.js',
    'node --test -r./hook.cjs file.test.js',
    'node --test file.test.js -r ./hook.cjs',
    'node --test file.test.js -r./hook.cjs',
    'node --test --loader ./loader.mjs file.test.js',
    'node --test file.test.js --loader=./loader.mjs',
    'node --test --experimental-loader ./loader.mjs file.test.js',
    'node --test file.test.js --experimental-loader=./loader.mjs',
    'node --test --test-reporter ./reporter.mjs file.test.js',
    'node --test file.test.js --test-reporter=./reporter.mjs',
    'node --test --eval "console.log(1)"',
    'node --test file.test.js --eval="console.log(1)"',
    'node --test -e "console.log(1)"',
    'node --test -e"console.log(1)"',
    'node --test file.test.js -e "console.log(1)"',
    'node --test file.test.js -e"console.log(1)"',
    'go test -exec ./runner ./...',
    'go test ./... -exec=./runner',
    'go test -toolexec ./runner ./...',
    'go test ./... -toolexec=./runner',
    'cargo test --offline --config config.toml',
    'cargo test --offline package_name --config=config.toml',
    'pytest --basetemp scratch tests/test_example.py',
    'pytest tests/test_example.py --basetemp=scratch',
    'python -m pytest --basetemp scratch tests/test_example.py',
    'python -m pytest tests/test_example.py --basetemp=scratch',
    'python3 -m pytest --basetemp scratch tests/test_example.py',
    'python3 -m pytest tests/test_example.py --basetemp=scratch',
    'pnpm exec jest --clearCache',
    'pnpm exec jest file.test.ts --cacheDirectory=scratch',
    'npx --no-install jest --clearCache',
    'npx --no-install jest file.test.ts --cacheDirectory scratch',
    'pnpm exec vitest run file.test.ts --coverage.reportsDirectory=scratch',
    'npx --no-install vitest run file.test.ts --coverage.reportsDirectory scratch',
    'ruff check --config settings.toml touched.py',
    'ruff check touched.py --config=settings.toml',
    'ruff check --unsafe-fixes --fix touched.py',
    'mypy --ins src/touched.py',
    'mypy src/touched.py --install',
    'mypy --install-t src/touched.py',
    'mypy @args.txt',
    'mypy src/touched.py @args.txt',
    'terraform fmt -recursive main.tf',
    'terraform fmt -recursive=true main.tf',
  ])('denies runner flags that bypass verification restrictions: %s', command => {
    // Arrange: dangerous-looking inputs remain strings, never shell commands.
    const rules = loadAgent(filename).permission.bash;

    // Act
    const action = resolveRule(rules, command);

    // Assert
    expect(action).toBe('deny');
  });

  it.each([
    'pnpm install',
    'pnpm add example-package',
    'npm install example-package',
    'yarn add example-package',
    'bun install',
    'pip install example-package',
    'npx vitest run file.test.ts',
    'pnpm dlx vitest run file.test.ts',
    'node -e "console.log(1)"',
    'node script.js',
    'tsx script.ts',
    'pnpm exec tsx script.ts',
    'pnpm run fix --',
    'pnpm run fix',
    'pnpm exec biome format touched.ts',
    'cargo test',
    'git diff',
    'git show HEAD',
    'git log -1',
    'git push origin HEAD',
    'git reset --hard HEAD',
    'git clean -fd',
    'git remote add mirror https://example.com/repo.git',
    'git remote set-url origin https://example.com/repo.git',
    'curl -X POST https://example.com/resource',
    'unlisted-command',
    'sudo pnpm test',
    'mypy --install-types',
    'mypy src/touched.py --install-types --non-interactive',
    'mypy --install-types src/touched.py',
    'ruff check touched.py --fix --unsafe-fixes',
    'ruff check --unsafe-fixes touched.py',
    'pnpm exec biome check touched.ts --write --unsafe',
    'pnpm exec biome check --unsafe touched.ts',
    'python -c "print(1)"',
    'python3 script.py',
    'terraform init',
    'terraform plan',
    'terraform apply',
    'terraform destroy',
    'terraform test',
    'terraform test -filter=example.tftest.hcl',
    'terraform fmt',
    'terraform fmt -recursive',
    'terraform fmt modules/example',
    'terraform fmt settings.tfvars',
    'mvn test',
    'mvn verify',
    './mvnw test',
    './mvnw verify',
    'gradle test',
    'gradle check',
    './gradlew test',
    './gradlew check',
    'mvn --offline deploy',
    './mvnw -o deploy',
    'gradle --offline publish',
    './gradlew --offline publish',
  ])('denies unlisted, destructive or external commands: %s', command => {
    // Arrange
    const rules = loadAgent(filename).permission.bash;

    // Act
    const action = resolveRule(rules, command);

    // Assert
    expect(action).toBe('deny');
  });

  it.each(JAVA_VERIFICATION_COMMANDS)('denies extra Java goals or tasks appended to %s', command => {
    // Arrange: exact offline commands must not allow later deploy/publish tasks.
    const rules = loadAgent(filename).permission.bash;
    const commands = [`${command} deploy`, `${command} publish`];

    // Act
    const actions = commands.map(value => resolveRule(rules, value));

    // Assert
    expect(actions).toEqual(['deny', 'deny']);
  });

  it.each(['diff', 'show', 'log'])('denies %s output writes and helper enabling flags', subcommand => {
    // Arrange: later denials must override the read-only allow pattern.
    const rules = loadAgent(filename).permission.bash;
    const prefix = `git ${subcommand} --no-ext-diff --no-textconv`;
    const commands = [
      `${prefix} --output=report.txt`,
      `${prefix} --output report.txt`,
      `${prefix} --ext-diff`,
      `${prefix} --textconv`,
      `git ${subcommand} --ext-diff --no-ext-diff --no-textconv`,
      `git ${subcommand} --textconv --no-ext-diff --no-textconv`,
    ];

    // Act
    const actions = commands.map(command => resolveRule(rules, command));

    // Assert
    expect(actions).toEqual(commands.map(() => 'deny'));
  });

  it('keeps recursive deletion restricted, including the existing approval rule', () => {
    // Arrange
    const rules = loadAgent(filename).permission.bash;

    // Act
    const action = resolveRule(rules, 'rm -rf build');

    // Assert
    expect(action).toBe(name === 'TestEngineer' ? 'ask' : 'deny');
  });

  it.each(['config/.env', 'config/.env.local', 'config/signing.key', 'config/token.secret'])(
    'preserves secret-edit denial: %s', path => {
      // Arrange
      const rules = loadAgent(filename).permission.edit;

      // Act
      const action = resolveRule(rules, path);

      // Assert
      expect(action).toBe('deny');
    }
  );

  it('does not apply secret-edit patterns to ordinary source files', () => {
    // Arrange
    const rules = loadAgent(filename).permission.edit;

    // Act: no matching source rule; runtime defaults are outside this model.
    const action = resolveRule(rules, 'src/touched.ts');

    // Assert
    expect(action).toBeUndefined();
  });
});

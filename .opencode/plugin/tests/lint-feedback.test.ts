import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  compareDiagnostics,
  createLintFeedbackHooks,
  formatFeedback,
  getTouchedPaths,
  parseApplyPatchPaths,
  parseBiomeDiagnostics,
  parseMeasuredValue,
  resolveWorktreePath,
  type LintDiagnostic,
} from "../lib/lint-feedback-core"

function biomeDiagnostic(
  category: string,
  message: string,
  line = 1,
) {
  return {
    category,
    message,
    location: {
      path: "src/example.ts",
      start: { line, column: 1 },
      end: { line, column: 17 },
    },
  }
}

function spanBiomeDiagnostic(sourceCode: string, offset: number) {
  // Compatibility fixture for Biome reporters that encode file paths and byte spans structurally.
  return {
    category: "lint/style/noNestedTernary",
    message: "Do not nest ternary expressions.",
    location: {
      path: { file: "src/span-example.ts" },
      sourceCode,
      span: [offset, offset + 1],
    },
  }
}

function parse(...diagnostics: Record<string, unknown>[]): LintDiagnostic[] {
  return parseBiomeDiagnostics(JSON.stringify({ diagnostics }))
}

const complexity = (value: number, line = 1) => parse(
  biomeDiagnostic(
    "lint/complexity/noExcessiveCognitiveComplexity",
    `Excessive complexity of ${value} detected (max: 15).`,
    line,
  ),
)[0]

const nestedTernary = (line = 1) => parse(
  biomeDiagnostic("lint/style/noNestedTernary", "Do not nest ternary expressions.", line),
)[0]

describe("Biome diagnostic comparison", () => {
  test("keeps a clean file clean", () => {
    expect(compareDiagnostics([], [])).toEqual([])
  })

  test("does not report unchanged legacy diagnostics", () => {
    const legacy = [complexity(22), nestedTernary()]
    expect(compareDiagnostics(legacy, legacy)).toEqual([])
  })

  test("ignores line shifts using current Biome locations", () => {
    expect(compareDiagnostics([complexity(22)], [complexity(22, 3)])).toEqual([])
  })

  test("parses current Biome path and start locations", () => {
    const diagnostic = complexity(22)

    expect(diagnostic).toMatchObject({
      path: "src/example.ts",
      line: 1,
      column: 1,
      measuredValue: 22,
    })
  })

  test("parses Biome path.file and byte span locations", () => {
    const diagnostic = parse(spanBiomeDiagnostic("first\nsecond", 6))[0]

    expect(diagnostic).toMatchObject({
      path: "src/span-example.ts",
      line: 2,
      column: 1,
      offset: 6,
    })
  })

  test("formats a byte offset when span source text is unavailable", () => {
    const diagnostic = parse({
      ...spanBiomeDiagnostic("first\nsecond", 6),
      location: { path: { file: "src/span-example.ts" }, span: [6, 7] },
    })[0]

    expect(formatFeedback([diagnostic])).toContain("src/span-example.ts@byte 6")
  })

  test("does not report a fixed regression", () => {
    expect(compareDiagnostics([nestedTernary()], [])).toEqual([])
  })

  test("reports an increased measured value", () => {
    expect(compareDiagnostics([complexity(22)], [complexity(23)])).toHaveLength(1)
  })

  test("does not report unchanged measured values after a function rename", () => {
    expect(compareDiagnostics([complexity(22)], [complexity(22, 3)])).toEqual([])
  })

  test("filters parse and internal diagnostics", () => {
    const diagnostics = parse({
      category: "parse",
      message: "Unexpected token",
      location: { path: "src/example.ts", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    })
    expect(diagnostics).toEqual([])
  })

  test("parses function-length measured values", () => {
    expect(parseMeasuredValue(
      "lint/complexity/noExcessiveLinesPerFunction",
      "This function has too many lines (63). Maximum allowed is 50.",
    )).toBe(63)
  })

  test("parses the prior score from Biome complexity advice", () => {
    expect(parseMeasuredValue(
      "lint/complexity/noExcessiveCognitiveComplexity",
      "Reduce the complexity score from 17 to the max allowed complexity 15.",
    )).toBe(17)
  })

  test("parses measured values from Biome advice", () => {
    const diagnostic = parse({
      category: "lint/complexity/noExcessiveCognitiveComplexity",
      message: "This function is too complex.",
      advices: [{ log: "Excessive complexity of 22 detected (max: 15)." }],
      location: { path: "src/example.ts", start: { line: 1, column: 1 } },
    })[0]

    expect(diagnostic.measuredValue).toBe(22)
  })

  test("prefers the primary measured value and separates advice fragments", () => {
    const primary = parse({
      category: "lint/complexity/noExcessiveLinesPerFunction",
      message: "This function has too many lines (63). Maximum allowed is 50.",
      advices: [{ log: "Consider splitting this into 2 lines." }],
    })[0]
    const adviceOnly = parse({
      category: "lint/complexity/noExcessiveLinesPerFunction",
      message: "Rule version 2",
      advices: [{ log: "5 lines" }],
    })[0]

    expect(primary.measuredValue).toBe(63)
    expect(adviceOnly.measuredValue).toBe(5)
  })

  test("compares nested ternaries by matched count", () => {
    expect(compareDiagnostics([nestedTernary()], [nestedTernary(), nestedTernary()])).toHaveLength(1)
  })

  test("reports the newly inserted count-only diagnostic", () => {
    expect(compareDiagnostics(
      [nestedTernary(20)],
      [nestedTernary(10), nestedTernary(21)],
    )).toEqual([nestedTernary(10)])
  })

  test("reports a different diagnostic when its category count is unchanged", () => {
    const legacy = { ...nestedTernary(20), description: "legacy diagnostic" }
    const replacement = { ...nestedTernary(20), description: "new diagnostic" }

    expect(compareDiagnostics([legacy], [replacement])).toEqual([replacement])
  })

  test("uses source text to distinguish repeated generic diagnostics", () => {
    const legacy = { ...nestedTernary(20), sourceText: "a ? b : c ? d : e" }
    const replacement = { ...nestedTernary(20), sourceText: "x ? y : z ? q : r" }

    expect(compareDiagnostics([legacy], [replacement])).toEqual([replacement])
  })

  test("extracts source identity from standard Biome start and end locations", () => {
    const first = parseBiomeDiagnostics(JSON.stringify({ diagnostics: [biomeDiagnostic(
      "lint/style/noNestedTernary",
      "Do not nest ternary expressions.",
      1,
    )] }), "a ? b : c ? d : e\n")[0]
    const second = parseBiomeDiagnostics(JSON.stringify({ diagnostics: [biomeDiagnostic(
      "lint/style/noNestedTernary",
      "Do not nest ternary expressions.",
      1,
    )] }), "x ? y : z ? q : r\n")[0]

    expect(compareDiagnostics([first], [second])).toEqual([second])
  })

  test("extracts the exact source range from one-based line and column positions", () => {
    const expression = "a ? b : c ? d : e"
    const diagnostic = parseBiomeDiagnostics(JSON.stringify({ diagnostics: [{
      category: "lint/style/noNestedTernary",
      message: "Do not nest ternary expressions.",
      location: {
        path: "src/example.ts",
        start: { line: 2, column: 15 },
        end: { line: 2, column: 15 + expression.length },
      },
    }] }), `const x = 0\nconst value = ${expression}\n`)[0]

    expect(diagnostic.sourceText).toBe(expression)
  })

  test("matches measured diagnostics by location before comparing values", () => {
    const before = [complexity(30, 10), complexity(20, 100)]
    const after = [complexity(20, 10), complexity(29, 100)]

    expect(compareDiagnostics(before, after)).toEqual([complexity(29, 100)])
  })

  test("matches reordered measured diagnostics by source before location", () => {
    const before = [
      { ...complexity(20, 10), sourceText: "function alpha" },
      { ...complexity(30, 100), sourceText: "function beta" },
    ]
    const after = [
      { ...complexity(30, 10), sourceText: "function beta" },
      { ...complexity(20, 100), sourceText: "function alpha" },
    ]

    expect(compareDiagnostics(before, after)).toEqual([])
  })

  test("uses Biome byte spans to identify an earlier count-only diagnostic", () => {
    const beforeSource = `${"\n".repeat(19)}x`
    const afterSource = `${"\n".repeat(9)}x${"\n".repeat(10)}x`
    const before = parse(spanBiomeDiagnostic(beforeSource, 19))
    const after = parse(spanBiomeDiagnostic(afterSource, 9), spanBiomeDiagnostic(afterSource, 20))

    expect(compareDiagnostics(before, after)).toMatchObject([{ line: 10, offset: 9 }])
  })

  test("caps feedback at ten diagnostics", () => {
    const feedback = formatFeedback(Array.from({ length: 12 }, nestedTernary))
    expect(feedback.match(/lint\/style\/noNestedTernary/g)).toHaveLength(10)
    expect(feedback).toContain("and 2 more regressions")
  })

  test("formats actionable diagnostic locations", () => {
    const feedback = formatFeedback([{
      ...complexity(22),
      path: "src/example.ts",
      line: 12,
      column: 3,
    }])
    expect(feedback).toContain("src/example.ts:12:3")
  })
})

describe("touched paths", () => {
  test("parses apply_patch add, update, and delete headers", () => {
    const patch = "*** Add File: src/new.ts\n*** Update File: src/old.ts\n*** Delete File: src/gone.ts"
    expect(parseApplyPatchPaths(patch)).toEqual([
      { operation: "Add", path: "src/new.ts" },
      { operation: "Update", path: "src/old.ts" },
      { operation: "Delete", path: "src/gone.ts" },
    ])
    expect(getTouchedPaths("apply_patch", { patchText: patch }, "/repo")).toEqual([
      "src/new.ts",
      "src/old.ts",
    ])
  })

  test("tracks an apply_patch move destination", () => {
    const patch = "*** Update File: src/old.ts\n*** Move to: src/new.ts\n@@"
    expect(parseApplyPatchPaths(patch)).toEqual([
      { operation: "Update", path: "src/old.ts", moveTo: "src/new.ts" },
    ])
    expect(getTouchedPaths("apply_patch", { patchText: patch }, "/repo")).toEqual(["src/new.ts"])
  })

  test("tracks a move whose destination becomes source code", () => {
    const patch = "*** Update File: src/template.txt\n*** Move to: src/template.ts\n@@"

    expect(getTouchedPaths("apply_patch", { patchText: patch }, "/repo")).toEqual(["src/template.ts"])
  })

  test("supports edit and write path field variants", () => {
    expect(getTouchedPaths("edit", { file_path: "src/a.ts" }, "/repo")).toEqual(["src/a.ts"])
    expect(getTouchedPaths("write", { path: "src/b.ts" }, "/repo")).toEqual(["src/b.ts"])
  })

  test("rejects outside-worktree and non-source paths", () => {
    expect(resolveWorktreePath("/repo", "../outside.ts")).toBeUndefined()
    expect(resolveWorktreePath("/repo", "/tmp/outside.ts")).toBeUndefined()
    expect(resolveWorktreePath("/repo", "--config-path=outside.ts")).toBeUndefined()
    expect(resolveWorktreePath("/repo", "README.md")).toBeUndefined()
  })
})

test("concurrent calls keep independent before snapshots", async () => {
  let releaseA!: () => void
  let releaseB!: () => void
  const gates = new Map([
    ["src/a.ts", new Promise<void>(resolve => { releaseA = resolve })],
    ["src/b.ts", new Promise<void>(resolve => { releaseB = resolve })],
  ])
  const runs = new Map<string, number>()
  const hooks = createLintFeedbackHooks({
    worktree: "/repo",
    command: ["biome"],
    timeoutMs: 100,
    fileExists: async () => true,
    runDiagnostics: async relativePath => {
      const count = (runs.get(relativePath) ?? 0) + 1
      runs.set(relativePath, count)
      if (count === 1) return [complexity(relativePath === "src/a.ts" ? 20 : 30)]
      await gates.get(relativePath)
      return [complexity(relativePath === "src/a.ts" ? 21 : 30)]
    },
  })

  await hooks["tool.execute.before"](
    { tool: "edit", sessionID: "session", callID: "a" },
    { args: { filePath: "src/a.ts" } },
  )
  await hooks["tool.execute.before"](
    { tool: "edit", sessionID: "session", callID: "b" },
    { args: { filePath: "src/b.ts" } },
  )
  const outputA = { output: "edited a" }
  const outputB = { output: "edited b" }
  const afterA = hooks["tool.execute.after"](
    { tool: "edit", sessionID: "session", callID: "a", args: { filePath: "src/a.ts" } },
    outputA,
  )
  const afterB = hooks["tool.execute.after"](
    { tool: "edit", sessionID: "session", callID: "b", args: { filePath: "src/b.ts" } },
    outputB,
  )
  releaseB()
  releaseA()
  await Promise.all([afterA, afterB])

  expect(outputA.output).toContain("New or worsened diagnostics")
  expect(outputB.output).toBe("edited b")
})

test("reports a diagnostic for a newly created file and preserves tool output", async () => {
  let exists = false
  const hooks = createLintFeedbackHooks({
    worktree: "/repo",
    command: ["biome"],
    timeoutMs: 100,
    fileExists: async () => exists,
    runDiagnostics: async () => [nestedTernary()],
  })
  await hooks["tool.execute.before"](
    { tool: "write", sessionID: "session", callID: "new" },
    { args: { filePath: "src/new.ts" } },
  )
  exists = true
  const output = { output: "created file" }

  await hooks["tool.execute.after"](
    { tool: "write", sessionID: "session", callID: "new" },
    output,
  )

  expect(output.output.startsWith("created file\n\n[lint-feedback] New or worsened diagnostics:")).toBe(true)
})

test("compares a moved file against its source-path snapshot", async () => {
  let moved = false
  const hooks = createLintFeedbackHooks({
    worktree: "/repo",
    command: ["biome"],
    timeoutMs: 100,
    fileExists: async relativePath => moved ? relativePath === "src/new.ts" : relativePath === "src/old.ts",
    runDiagnostics: async relativePath => relativePath === "src/old.ts"
      ? [nestedTernary(20)]
      : [nestedTernary(10), nestedTernary(21)],
  })
  const patchText = "*** Update File: src/old.ts\n*** Move to: src/new.ts\n@@"
  await hooks["tool.execute.before"](
    { tool: "apply_patch", sessionID: "session", callID: "move" },
    { args: { patchText } },
  )
  moved = true
  const output = { output: "moved file" }

  await hooks["tool.execute.after"](
    { tool: "apply_patch", sessionID: "session", callID: "move" },
    output,
  )

  expect(output.output).toContain("src/example.ts:10:1")
  expect(output.output).not.toContain("src/example.ts:21:1")
})

test("skips a file missing after the edit", async () => {
  let exists = true
  const hooks = createLintFeedbackHooks({
    worktree: "/repo",
    command: ["biome"],
    timeoutMs: 100,
    fileExists: async () => exists,
    runDiagnostics: async () => [nestedTernary()],
  })
  await hooks["tool.execute.before"](
    { tool: "edit", sessionID: "session", callID: "missing" },
    { args: { filePath: "src/missing.ts" } },
  )
  exists = false
  const output = { output: "original tool output" }

  await hooks["tool.execute.after"](
    { tool: "edit", sessionID: "session", callID: "missing" },
    output,
  )

  expect(output.output).toBe("original tool output")
})

for (const failure of ["command", "parse"] as const) {
  test(`${failure} failures preserve output and append one short warning`, async () => {
    let calls = 0
    const hooks = createLintFeedbackHooks({
      worktree: "/repo",
      command: ["biome"],
      timeoutMs: 100,
      fileExists: async () => true,
      runDiagnostics: async () => {
        calls += 1
        if (failure === "command") throw new Error("command failed")
        if (calls === 1) return []
        return parseBiomeDiagnostics("not JSON")
      },
    })
    await hooks["tool.execute.before"](
      { tool: "write", sessionID: "session", callID: failure },
      { args: { filePath: "src/a.ts" } },
    )
    const output = { output: "original tool output" }

    await hooks["tool.execute.after"](
      { tool: "write", sessionID: "session", callID: failure },
      output,
    )

    expect(output.output).toBe("original tool output\n\n[lint-feedback] Lint check failed; the edit was preserved.")
  })
}

test("lint failures warn only once per session", async () => {
  const hooks = createLintFeedbackHooks({
    worktree: "/repo",
    command: ["biome"],
    timeoutMs: 100,
    fileExists: async () => true,
    runDiagnostics: async () => { throw new Error("broken") },
  })

  for (const callID of ["first", "second"]) {
    await hooks["tool.execute.before"](
      { tool: "edit", sessionID: "same-session", callID },
      { args: { filePath: "src/a.ts" } },
    )
    const output = { output: "edited" }
    await hooks["tool.execute.after"](
      { tool: "edit", sessionID: "same-session", callID, args: { filePath: "src/a.ts" } },
      output,
    )
    expect(output.output).toBe(callID === "first"
      ? "edited\n\n[lint-feedback] Lint check failed; the edit was preserved."
      : "edited")
  }
})

test("plugin entrypoint exports only one plugin factory", async () => {
  const plugin = await import("../lint-feedback")

  expect(Object.keys(plugin)).toEqual(["default"])
})

test("plugin runtime supplies file source text to diagnostic comparison", async () => {
  const worktree = await mkdtemp(path.join(tmpdir(), "lint-feedback-"))
  const relativePath = "src/example.ts"
  const filePath = path.join(worktree, relativePath)
  const reporterOutput = JSON.stringify({ diagnostics: [biomeDiagnostic(
    "lint/style/noNestedTernary",
    "Do not nest ternary expressions.",
  )] })
  const plugin = await import("../lint-feedback")
  let hooks: Awaited<ReturnType<typeof plugin.default>> | undefined

  try {
    await mkdir(path.dirname(filePath))
    await writeFile(filePath, "a ? b : c ? d : e\n")
    hooks = await plugin.default(
      { worktree } as Parameters<typeof plugin.default>[0],
      { command: [process.execPath, "-e", `console.log(${JSON.stringify(reporterOutput)})`] },
    )
    await hooks["tool.execute.before"]?.(
      { tool: "edit", sessionID: "source-session", callID: "source" },
      { args: { filePath: relativePath } },
    )
    await writeFile(filePath, "x ? y : z ? q : r\n")
    const output = { title: "edit", output: "edited", metadata: {} }

    await hooks["tool.execute.after"]?.(
      { tool: "edit", sessionID: "source-session", callID: "source", args: { filePath: relativePath } },
      output,
    )

    expect(output.output).toContain("New or worsened diagnostics")
  } finally {
    await hooks?.dispose?.()
    await rm(worktree, { recursive: true, force: true })
  }
})

test("lint timeout settles even when the child ignores SIGTERM", async () => {
  const plugin = await import("../lint-feedback")
  const pluginDirectory = path.resolve(import.meta.dir, "..")
  const hooks = await plugin.default(
    { worktree: pluginDirectory } as Parameters<typeof plugin.default>[0],
    {
      command: [process.execPath, "-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      timeoutMs: 20,
    },
  )
  const before = hooks["tool.execute.before"]
  const after = hooks["tool.execute.after"]
  expect(before).toBeDefined()
  expect(after).toBeDefined()

  await expect(Promise.race([
    before?.(
      { tool: "edit", sessionID: "timeout-session", callID: "timeout" },
      { args: { filePath: "lint-feedback.ts" } },
    ),
    new Promise((_, reject) => setTimeout(() => reject(new Error("hook remained pending")), 500)),
  ])).resolves.toBeUndefined()

  const output = { title: "edit", output: "edited", metadata: {} }
  await after?.(
    { tool: "edit", sessionID: "timeout-session", callID: "timeout", args: { filePath: "lint-feedback.ts" } },
    output,
  )
  expect(output.output).toContain("Lint check failed; the edit was preserved.")
  await hooks.dispose?.()
})

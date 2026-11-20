import { expect, test } from "bun:test";
import { builtinTools } from "../../src/tools/builtin";
import { runEval } from "../../src/tools/eval/run";
import type { ToolContext } from "../../src/tools/types";

const tool = builtinTools().find((entry) => entry.name === "eval");
if (!tool) throw new Error("eval tool is not registered");

const context = {
  sessionId: `eval-test-${crypto.randomUUID()}`,
  cwd: process.cwd(),
  signal: new AbortController().signal,
} as unknown as ToolContext;

test("javascript eval preserves kernel state across calls", async () => {
  const first = await runEval(
    { language: "javascript", operation: "run", code: "globalThis.counter = 41" },
    context,
  );
  expect(first.ok).toBe(true);
  const second = await runEval(
    { language: "javascript", operation: "run", code: "globalThis.counter += 1; print(globalThis.counter)" },
    context,
  );
  expect(second.ok).toBe(true);
  expect(second.output).toContain("42");
});

test("javascript eval captures printed output and errors separately", async () => {
  const output = await runEval(
    { language: "javascript", operation: "run", code: "print('hello from eval')" },
    context,
  );
  expect(output.ok).toBe(true);
  expect(output.output).toContain("hello from eval");
  const failure = await runEval(
    { language: "javascript", operation: "run", code: "throw new Error('boom')" },
    context,
  );
  expect(failure.ok).toBe(false);
  expect(failure.error).toContain("boom");
});

test("python eval preserves kernel state across calls", async () => {
  const first = await runEval(
    { language: "python", operation: "run", code: "counter = 41; print(counter)" },
    context,
  );
  expect(first.ok).toBe(true);
  expect(first.output).toContain("41");
  const second = await runEval(
    { language: "python", operation: "run", code: "counter += 1; print(counter)" },
    context,
  );
  expect(second.ok).toBe(true);
  expect(second.output).toContain("42");
});

test("eval status and reset manage kernel lifecycle", async () => {
  await runEval({ language: "python", operation: "run", code: "value = 10" }, context);
  const status = await runEval({ language: "python", operation: "status" }, context);
  const statusBody = JSON.parse(status.output as string);
  expect(statusBody.persistent).toBe(true);
  expect(statusBody.runs).toBeGreaterThan(0);
  const reset = await runEval({ language: "python", operation: "reset" }, context);
  expect(reset.ok).toBe(true);
  const after = await runEval({ language: "python", operation: "status" }, context);
  const afterBody = JSON.parse(after.output as string);
  expect(afterBody.persistent).toBe(false);
});

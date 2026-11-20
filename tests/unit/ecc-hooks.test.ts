import { beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { discoverEcc } from "../../src/ecc/discovery";
import { eccHooks } from "../../src/ecc/hooks";
import { EccConfigSchema } from "../../src/ecc/schema";

let root = join(import.meta.dir, "..", "..", "node_modules", "ecc-universal");

beforeEach(() => {
  root = join(import.meta.dir, "..", "..", "node_modules", "ecc-universal");
});

test("native ECC hook bridge emits executable definitions for supported events", async () => {
  const discovery = await discoverEcc(EccConfigSchema.parse({ root }));
  const hooks = eccHooks(discovery, "standard");
  expect(Object.keys(hooks).sort()).toEqual([
    "compact",
    "postToolUse",
    "preToolUse",
    "sessionEnd",
    "sessionStart",
    "stop",
    "userPromptSubmit",
  ]);
  for (const definitions of Object.values(hooks)) {
    for (const hook of definitions) {
      expect(hook.command ?? "").toContain("run-with-flags.js");
      expect(hook.enabled).toBe(true);
      expect(hook.timeoutMs).toBeGreaterThan(0);
      expect(hook.env?.CLAUDE_PLUGIN_ROOT).toBe(discovery.root);
      if (hook.failClosed) expect(hook.failClosed).toBe(true);
    }
  }
});

test("minimal ECC profile includes only hooks with explicit minimal support", async () => {
  const discovery = await discoverEcc(EccConfigSchema.parse({ root }));
  const hooks = eccHooks(discovery, "minimal");
  expect(Object.keys(hooks).sort()).toEqual(["sessionEnd", "sessionStart", "stop"]);
});

test("hook commands are shell-safe and use the official runner", async () => {
  const discovery = await discoverEcc(EccConfigSchema.parse({ root }));
  const hooks = eccHooks(discovery, "strict");
  for (const definitions of Object.values(hooks)) {
    for (const hook of definitions) {
      const command = hook.command ?? "";
      expect(command.startsWith(JSON.stringify(process.execPath))).toBe(true);
      expect(command).toContain("run-with-flags.js");
      expect(command.endsWith(JSON.stringify("strict"))).toBe(true);
    }
  }
});

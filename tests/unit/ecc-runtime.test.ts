import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeEccAgents } from "../../src/ecc/agents";
import { loadSubagentDefinitions } from "../../src/core/subagents/definitions";
import { discoverEcc } from "../../src/ecc/discovery";
import { loadLanguageRules, loadPortableRules } from "../../src/ecc/rules";
import { EccConfigSchema } from "../../src/ecc/schema";
import { createEccTool } from "../../src/ecc/tool";
import { productEnv } from "../../shared/environment.cjs";

const directories: string[] = [];

beforeEach(() => {
  process.env.OMF_ECC_ENABLED = "1";
  process.env.OMF_ECC_ROOT = join(
    import.meta.dir,
    "..",
    "..",
    "node_modules",
    "ecc-universal",
  );
});

afterEach(async () => {
  delete process.env.OMF_ECC_ROOT;
  delete process.env.OMF_ECC_ENABLED;
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("OMF environment takes precedence while Flecten and Liquid stay compatible", () => {
  expect(
    productEnv("MODEL", {
      OMF_MODEL: "new",
      FLECTEN_MODEL: "upstream",
      LIQUID_MODEL: "legacy",
    }),
  ).toBe("new");
  expect(productEnv("MODEL", { FLECTEN_MODEL: "upstream", LIQUID_MODEL: "legacy" })).toBe("upstream");
  expect(productEnv("MODEL", { LIQUID_MODEL: "legacy" })).toBe("legacy");
  expect(productEnv("MODEL", {})).toBeUndefined();
});

test("ECC discovery exposes the complete canonical catalog", async () => {
  const config = EccConfigSchema.parse({ root: process.env.OMF_ECC_ROOT });
  const discovery = await discoverEcc(config);
  expect(discovery.version).toBe("2.2.3");
  expect(discovery.counts.skills).toBe(293);
  expect(discovery.counts.commands).toBe(94);
  expect(discovery.counts.agents).toBe(68);
  expect(discovery.counts.rules).toBe(122);
});

test("all ECC agents convert into valid Flecten subagent definitions", async () => {
  const config = EccConfigSchema.parse({ root: process.env.OMF_ECC_ROOT });
  const discovery = await discoverEcc(config);
  const cwd = await mkdtemp(join(tmpdir(), "omf-ecc-agents-"));
  directories.push(cwd);
  const agents = await materializeEccAgents(discovery, cwd);
  expect(agents.count).toBe(68);
  const definitions = loadSubagentDefinitions([agents.directory]);
  expect(definitions).toHaveLength(68);
  expect(definitions.every((definition) => definition.allowedTools.length > 0)).toBe(true);
  expect(agents.warnings.some((warning) => warning.includes("unsupported tools omitted"))).toBe(true);
});

test("ECC rules remain bounded and language-aware", async () => {
  const config = EccConfigSchema.parse({ root: process.env.OMF_ECC_ROOT });
  const discovery = await discoverEcc(config);
  const portable = await loadPortableRules(discovery);
  expect(portable).toContain("## ECC code-review");
  expect(Buffer.byteLength(portable)).toBeLessThanOrEqual(32 * 1024);
  const language = await loadLanguageRules(discovery, process.cwd());
  expect(language).toContain("## ECC typescript");
});

test("ECC gateway lazily lists, searches and reads canonical assets", async () => {
  const config = EccConfigSchema.parse({ root: process.env.OMF_ECC_ROOT });
  const discovery = await discoverEcc(config);
  const tool = createEccTool(discovery);
  const context = {
    sessionId: "test",
    cwd: process.cwd(),
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof tool.execute>[1];
  const list = await tool.execute(
    { operation: "list", kind: "skills", query: "python", offset: 0, limit: 5 },
    context,
  );
  expect(list.ok).toBe(true);
  const catalog = JSON.parse(list.output as string);
  expect(catalog.total).toBeGreaterThan(0);
  expect(catalog.items.length).toBeLessThanOrEqual(5);
  const first = catalog.items[0] as { name: string };
  const read = await tool.execute(
    { operation: "read", kind: "skills", name: first.name, offset: 0, limit: 1 },
    context,
  );
  expect(read.ok).toBe(true);
  const body = JSON.parse(read.output as string);
  expect(body.name).toBe(first.name);
  expect(body.content.length).toBeGreaterThan(0);
});

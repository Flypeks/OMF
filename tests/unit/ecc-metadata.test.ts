import { expect, test } from "bun:test";
import { join } from "node:path";
import { discoverSkills } from "../../src/skills/discover";
import { discoverEcc } from "../../src/ecc/discovery";
import { EccConfigSchema } from "../../src/ecc/schema";

const ECC_ROOT = join(import.meta.dir, "..", "..", "node_modules", "ecc-universal");

test("ECC discovery accepts canonical metadata object values without truncating the catalog", async () => {
  const config = EccConfigSchema.parse({ root: ECC_ROOT });
  const discovery = await discoverEcc(config);
  expect(discovery.counts.skills).toBe(293);
});

test("skill catalog reports all discoverable ECC skills with lenient metadata", async () => {
  const discovery = await discoverSkills(process.cwd(), {
    home: "/nonexistent-omf-home",
    sources: [],
    extraDirectories: [{ directory: join(ECC_ROOT, "skills") }],
    limit: 1000,
  });
  expect(discovery.skills).toHaveLength(293);
  expect(discovery.diagnostics.filter((entry) => entry.level === "error")).toHaveLength(0);
});

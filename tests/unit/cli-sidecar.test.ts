import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sidecar } from "../../src/cli/sidecar";

let sidecar: Sidecar | undefined;

beforeEach(() => {
  process.env.OMF_ECC_ROOT = join(
    import.meta.dir,
    "..",
    "..",
    "node_modules",
    "ecc-universal",
  );
  delete process.env.OMF_AGENT_BIN;
});

afterEach(async () => {
  if (sidecar) {
    await sidecar.close();
    sidecar = undefined;
  }
  delete process.env.OMF_ECC_ROOT;
});

test("sidecar client resolves status and shuts down the agent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "omf-sidecar-test-"));
  sidecar = new Sidecar(cwd);
  const response = await sidecar.request({ type: "status" });
  expect(response.type).toBe("status");
  expect(response.type).toBeString();
  expect(Object.keys(response).length).toBeGreaterThan(2);
  const exit = sidecar.process.exited;
  await sidecar.close();
  expect(await exit).toBe(0);
});

test("sidecar client resolves response-envelope commands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "omf-sidecar-test-"));
  sidecar = new Sidecar(cwd);
  const response = await sidecar.request({ type: "sessions.list", limit: 5 });
  expect(response.ok).toBe(true);
  expect(Array.isArray(response.sessions)).toBe(true);
  await sidecar.close();
});

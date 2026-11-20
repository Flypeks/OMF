import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { splitFrontmatter } from "../commands/custom";
import { parseSkillFile } from "../skills/schema";
import { defineTool, type Tool } from "../tools/types";
import type { EccDiscovery } from "./discovery";

const EccToolSchema = z
  .object({
    operation: z.enum(["status", "list", "read", "doctor"]),
    kind: z.enum(["skills", "agents", "commands"]).optional(),
    name: z.string().trim().min(1).max(256).optional(),
    query: z.string().trim().max(256).optional(),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().positive().max(50).default(20),
  })
  .strict();

interface EccAsset {
  name: string;
  description: string;
  path: string;
  body: string;
}

type EccAssetKind = "skills" | "agents" | "commands";

async function assets(discovery: EccDiscovery, kind: EccAssetKind): Promise<EccAsset[]> {
  if (kind === "skills") {
    const directories = await readdir(discovery.skillsDir, { withFileTypes: true });
    const result: EccAsset[] = [];
    for (const entry of directories) {
      if (!entry.isDirectory()) continue;
      const directory = join(discovery.skillsDir, entry.name);
      const path = join(directory, "SKILL.md");
      const raw = await readFile(path, "utf8").catch(() => "");
      if (!raw) continue;
      const parsed = parseSkillFile(raw, path, directory);
      const { body } = splitFrontmatter(raw);
      result.push({
        name: parsed.skill?.name ?? entry.name,
        description: parsed.skill?.description ?? "ECC skill",
        path,
        body: body.trim(),
      });
    }
    return result.sort((left, right) => left.name.localeCompare(right.name));
  }
  const directory = kind === "agents" ? discovery.agentsDir : discovery.commandsDir;
  const entries = await readdir(directory, { withFileTypes: true });
  const result: EccAsset[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(directory, entry.name);
    const raw = await readFile(path, "utf8");
    const { data, body } = splitFrontmatter(raw);
    result.push({
      name: entry.name.slice(0, -3),
      description:
        typeof data.description === "string" && data.description.trim()
          ? data.description.trim()
          : `ECC ${kind.slice(0, -1)} ${entry.name.slice(0, -3)}`,
      path,
      body: body.trim(),
    });
  }
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

function text(value: unknown): { ok: true; output: string; data?: unknown } {
  return { ok: true, output: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
}

export function createEccTool(discovery: EccDiscovery, agentWarnings: string[] = []): Tool {
  const cache = new Map<EccAssetKind, Promise<EccAsset[]>>();
  const load = (kind: EccAssetKind) => {
    let current = cache.get(kind);
    if (!current) {
      current = assets(discovery, kind);
      cache.set(kind, current);
    }
    return current;
  };
  return defineTool({
    name: "ecc",
    description:
      "Inspect the complete ECC catalog. List/search skills, agents and commands, read one asset on demand, or get native integration diagnostics. Catalog entries are loaded lazily; use read only for the selected asset.",
    schema: EccToolSchema,
    mutating: false,
    provenance: () => ({ source: "file", ref: `ecc-universal@${discovery.version}` }),
    execute: async (args) => {
      if (args.operation === "status" || args.operation === "doctor") {
        return text({
          status: "success",
          version: discovery.version,
          root: discovery.root,
          counts: discovery.counts,
          capabilities: {
            skills: "native lazy activation",
            commands: "native slash expansion",
            agents: "converted with permission intersection",
            rules: "portable and language-specific",
            hooks: "native lifecycle bridge",
          },
          degraded: ["Claude-only hook events are reported, never silently emulated"],
          warnings: agentWarnings,
          next_actions: ["Use ecc list to search the catalog", "Use ecc read for one selected asset"],
        });
      }
      const kind = args.kind;
      if (!kind) return { ok: false, output: "", error: "kind is required for this operation" };
      const catalog = await load(kind);
      if (args.operation === "read") {
        if (!args.name) return { ok: false, output: "", error: "name is required for read" };
        const asset = catalog.find((entry) => entry.name === args.name);
        if (!asset) return { ok: false, output: "", error: `Unknown ECC ${kind} asset: ${args.name}` };
        return text({
          status: "success",
          name: asset.name,
          description: asset.description,
          path: asset.path,
          content: asset.body.slice(0, 256 * 1024),
        });
      }
      const query = args.query?.toLocaleLowerCase();
      const filtered = query
        ? catalog.filter((entry) =>
            `${entry.name}\n${entry.description}`.toLocaleLowerCase().includes(query),
          )
        : catalog;
      const items = filtered.slice(args.offset, args.offset + args.limit);
      const nextOffset = args.offset + items.length;
      return text({
        status: "success",
        kind,
        total: filtered.length,
        items: items.map(({ name, description }) => ({ name, description })),
        ...(nextOffset < filtered.length ? { nextOffset } : {}),
        next_actions: ["Read a selected asset with ecc read"],
      });
    },
  });
}

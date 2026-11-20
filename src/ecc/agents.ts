import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { splitFrontmatter } from "../commands/custom";
import type { EccDiscovery } from "./discovery";

const TOOL_MAP: Readonly<Record<string, string>> = {
  AskUserQuestion: "ask",
  Bash: "bash",
  BashOutput: "jobs",
  Edit: "edit",
  Glob: "glob",
  Grep: "grep",
  KillShell: "jobs",
  LS: "glob",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Read: "read",
  Skill: "skill",
  Task: "task",
  TodoWrite: "todo",
  WebFetch: "web_fetch",
  WebSearch: "web_search",
  Write: "write",
};

const FALLBACK_TOOLS = ["read", "write", "edit", "grep", "glob", "bash"];

function toolNames(value: unknown): { names: string[]; unknown: string[] } {
  const source = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? value.split(",")
      : FALLBACK_TOOLS;
  const names = new Set<string>();
  const unknown: string[] = [];
  for (const entry of source) {
    const raw = entry.trim();
    if (!raw) continue;
    const mapped = TOOL_MAP[raw] ?? (Object.values(TOOL_MAP).includes(raw) ? raw : undefined);
    if (mapped) names.add(mapped);
    else unknown.push(raw);
  }
  if (names.size === 0) FALLBACK_TOOLS.forEach((name) => names.add(name));
  return { names: [...names], unknown };
}

function agentDocument(
  name: string,
  description: string,
  tools: string[],
  body: string,
): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nallowed-tools: ${JSON.stringify(tools)}\npermissions: []\nbudget:\n  maxTurns: 60\n  maxTokens: 200000\n---\n${body.trim()}\n`;
}

export interface EccAgentMaterialization {
  directory: string;
  count: number;
  warnings: string[];
}

export async function materializeEccAgents(
  discovery: EccDiscovery,
  cwd: string,
): Promise<EccAgentMaterialization> {
  const root = join(cwd, ".flecten", "ecc");
  const entries = await readdir(discovery.agentsDir, { withFileTypes: true });
  const sources = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const documents: { name: string; text: string; warning?: string }[] = [];
  for (const filename of sources) {
    const name = filename.slice(0, -3);
    const raw = await readFile(join(discovery.agentsDir, filename), "utf8");
    const { data, body } = splitFrontmatter(raw);
    const description =
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : `ECC specialist ${name}`;
    const tools = toolNames(data.tools ?? data["allowed-tools"]);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !body.trim()) continue;
    documents.push({
      name,
      text: agentDocument(name, description, tools.names, body),
      ...(tools.unknown.length
        ? { warning: `${name}: unsupported tools omitted: ${tools.unknown.join(", ")}` }
        : {}),
    });
  }
  const hash = createHash("sha256");
  hash.update(discovery.version);
  for (const document of documents) hash.update(document.name).update(document.text);
  const revision = hash.digest("hex").slice(0, 16);
  const directory = join(root, `agents-${revision}`);
  const temporary = join(root, `.agents-${revision}.tmp-${process.pid}`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  for (const document of documents)
    await Bun.write(join(temporary, `${document.name}.md`), document.text);
  await rm(directory, { recursive: true, force: true });
  await rename(temporary, directory);
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && entry.name.startsWith("agents-") && entry.name !== `agents-${revision}`)
      await rm(join(root, entry.name), { recursive: true, force: true });
  }
  return {
    directory,
    count: documents.length,
    warnings: documents.flatMap((document) => (document.warning ? [document.warning] : [])),
  };
}

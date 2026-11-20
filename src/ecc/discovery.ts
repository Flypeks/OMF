import { createRequire } from "node:module";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { EccConfig } from "./schema";

export interface EccDiscovery {
  root: string;
  version: string;
  skillsDir: string;
  commandsDir: string;
  agentsDir: string;
  rulesDir: string;
  counts: { skills: number; agents: number; commands: number; rules: number };
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

async function skillFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (await exists(join(directory, entry.name, "SKILL.md"))))
      files.push(join(directory, entry.name, "SKILL.md"));
  }
  return files.sort();
}

async function ruleFiles(directory: string): Promise<string[]> {
  const files = await markdownFiles(directory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) files.push(...(await markdownFiles(join(directory, entry.name))));
  }
  return files.sort();
}

export async function discoverEcc(config: EccConfig): Promise<EccDiscovery> {
  const require = createRequire(import.meta.url);
  const packagePath = config.root
    ? join(resolve(config.root), "package.json")
    : process.env.OMF_ECC_ROOT
      ? join(resolve(process.env.OMF_ECC_ROOT), "package.json")
      : require.resolve("ecc-universal/package.json");
  const root = dirname(packagePath);
  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string };
  if (typeof manifest.version !== "string" || manifest.version.length === 0)
    throw new Error(`ECC package manifest has no version: ${packagePath}`);
  const discovery: EccDiscovery = {
    root,
    version: manifest.version,
    skillsDir: join(root, "skills"),
    commandsDir: join(root, "commands"),
    agentsDir: join(root, "agents"),
    rulesDir: join(root, "rules"),
    counts: { skills: 0, agents: 0, commands: 0, rules: 0 },
  };
  const [skills, commands, agents, rules] = await Promise.all([
    skillFiles(discovery.skillsDir),
    markdownFiles(discovery.commandsDir),
    markdownFiles(discovery.agentsDir),
    ruleFiles(discovery.rulesDir),
  ]);
  if (skills.length + commands.length + agents.length === 0)
    throw new Error(`ECC assets were not found under ${root}`);
  discovery.counts = {
    skills: skills.length,
    commands: commands.length,
    agents: agents.length,
    rules: rules.length,
  };
  return discovery;
}

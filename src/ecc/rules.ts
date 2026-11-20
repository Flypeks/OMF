import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EccDiscovery } from "./discovery";

const PORTABLE_RULES = [
  "coding-style.md",
  "testing.md",
  "security.md",
  "git-workflow.md",
  "patterns.md",
  "development-workflow.md",
  "code-review.md",
] as const;

const LANGUAGE_MANIFESTS: Readonly<Record<string, string>> = {
  "Cargo.toml": "rust",
  "Gemfile": "ruby",
  "build.gradle": "kotlin",
  "build.gradle.kts": "kotlin",
  "composer.json": "php",
  "go.mod": "go",
  "package.json": "typescript",
  "pom.xml": "java",
  "pyproject.toml": "python",
  "requirements.txt": "python",
};

async function ruleSection(path: string, title: string): Promise<string> {
  const text = (await readFile(path, "utf8").catch(() => "")).trim();
  return text ? `\n\n## ${title}\n\n${text}` : "";
}

async function boundedRules(sections: string[]): Promise<string> {
  let result = "";
  for (const section of sections) {
    if (Buffer.byteLength(result) >= 32 * 1024) break;
    result += section;
  }
  return result.slice(0, 32 * 1024).trim();
}

export async function loadPortableRules(discovery: EccDiscovery): Promise<string> {
  const sections = await Promise.all(
    PORTABLE_RULES.map((name) =>
      ruleSection(join(discovery.rulesDir, "common", name), `ECC ${name.slice(0, -3)}`),
    ),
  );
  return boundedRules(sections);
}

export async function loadLanguageRules(discovery: EccDiscovery, cwd: string): Promise<string> {
  const sections: string[] = [];
  for (const [manifest, language] of Object.entries(LANGUAGE_MANIFESTS)) {
    if (!(await Bun.file(join(cwd, manifest)).exists())) continue;
    sections.push(
      await ruleSection(join(discovery.rulesDir, language, "coding-style.md"), `ECC ${language}`),
    );
  }
  return boundedRules(sections);
}

import { materializeEccAgents, type EccAgentMaterialization } from "../ecc/agents";
import { discoverEcc, type EccDiscovery } from "../ecc/discovery";
import { eccHooks } from "../ecc/hooks";
import { loadLanguageRules, loadPortableRules } from "../ecc/rules";
import { EccConfigSchema } from "../ecc/schema";
import { createEccTool } from "../ecc/tool";
import type { HookDefinition } from "../core/hooks/types";
import type { Tool } from "../tools/types";

export interface AppEcc {
  discovery: EccDiscovery;
  agents: EccAgentMaterialization;
  rules: string;
  tool: Tool;
  hooks: Record<string, HookDefinition[]>;
}

export async function createAppEcc(cwd: string): Promise<AppEcc | undefined> {
  const config = EccConfigSchema.parse({
    root: process.env.OMF_ECC_ROOT || undefined,
    hooksProfile: process.env.OMF_ECC_HOOK_PROFILE || "standard",
  });
  if (!config.enabled || process.env.OMF_ECC_ENABLED === "0") return undefined;
  const discovery = await discoverEcc(config);
  const [agents, portable, language] = await Promise.all([
    materializeEccAgents(discovery, cwd),
    loadPortableRules(discovery),
    loadLanguageRules(discovery, cwd),
  ]);
  const rules = [portable, language].filter(Boolean).join("\n\n");
  return {
    discovery,
    agents,
    rules,
    tool: createEccTool(discovery, agents.warnings),
    hooks: config.hooks ? eccHooks(discovery, config.hooksProfile) : {},
  };
}

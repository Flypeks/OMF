import type { HookDefinition } from "../core/hooks/types";
import type { EccDiscovery } from "./discovery";

export interface EccHookSpec {
  event: "sessionStart" | "userPromptSubmit" | "preToolUse" | "postToolUse" | "stop" | "sessionEnd" | "compact";
  id: string;
  script: string;
  profiles: string;
  failClosed?: boolean;
  matcher?: string;
  async?: boolean;
  timeoutMs: number;
}

export const ECC_HOOKS: readonly EccHookSpec[] = [
  {
    event: "sessionStart",
    id: "session:start",
    script: "scripts/hooks/session-start.js",
    profiles: "minimal,standard,strict",
    failClosed: true,
    timeoutMs: 30_000,
  },
  {
    event: "sessionEnd",
    id: "session:end:marker",
    script: "scripts/hooks/session-end-marker.js",
    profiles: "minimal,standard,strict",
    failClosed: true,
    timeoutMs: 30_000,
  },
  {
    event: "userPromptSubmit",
    id: "prompt:context-gate",
    script: "scripts/hooks/context-gate.js",
    profiles: "standard,strict",
    timeoutMs: 10_000,
  },
  {
    event: "preToolUse",
    id: "pre:config-protection",
    script: "scripts/hooks/config-protection.js",
    profiles: "standard,strict",
    failClosed: true,
    matcher: "*",
    timeoutMs: 10_000,
  },
  {
    event: "preToolUse",
    id: "pre:edit-write:gateguard-fact-force",
    script: "scripts/hooks/gateguard-fact-force.js",
    profiles: "standard,strict",
    failClosed: true,
    matcher: "*",
    timeoutMs: 10_000,
  },
  {
    event: "postToolUse",
    id: "post:observe",
    script: "scripts/hooks/observe-runner.js",
    profiles: "standard,strict",
    matcher: "*",
    timeoutMs: 10_000,
  },
  {
    event: "stop",
    id: "stop:session-end",
    script: "scripts/hooks/session-end.js",
    profiles: "minimal,standard,strict",
    timeoutMs: 30_000,
  },
  {
    event: "compact",
    id: "pre:compact",
    script: "scripts/hooks/pre-compact.js",
    profiles: "standard,strict",
    timeoutMs: 30_000,
  },
];

function quote(value: string): string {
  return JSON.stringify(value);
}

function hookCommand(discovery: EccDiscovery, spec: EccHookSpec, profile: string): string {
  const runner = `${discovery.root}/scripts/hooks/run-with-flags.js`;
  return [
    process.execPath,
    runner,
    spec.id,
    spec.script,
    profile,
  ]
    .map(quote)
    .join(" ");
}

export function eccHooks(
  discovery: EccDiscovery,
  profile: "minimal" | "standard" | "strict",
): Record<string, HookDefinition[]> {
  const hooks: Record<string, HookDefinition[]> = {};
  for (const spec of ECC_HOOKS) {
    if (profile === "minimal" && !spec.profiles.includes("minimal")) continue;
    const hook: HookDefinition = {
      id: `ecc:${spec.id}`,
      name: `ECC ${spec.id}`,
      responseFormat: "json",
      command: hookCommand(discovery, spec, profile),
      timeoutMs: spec.timeoutMs,
      enabled: true,
      ...(spec.async ? { async: true } : {}),
      ...(spec.failClosed ? { failClosed: true } : {}),
      ...(spec.matcher ? { matcher: spec.matcher } : {}),
      env: {
        CLAUDE_PLUGIN_ROOT: discovery.root,
        ECC_PLUGIN_ROOT: discovery.root,
      },
    };
    hooks[spec.event] = [...(hooks[spec.event] ?? []), hook];
  }
  return hooks;
}

#!/usr/bin/env bun
import { createAppEcc } from "../app/ecc";
import type { ToolContext } from "../tools/types";
import { agentCommand, agentEnvironment, withSidecar } from "./sidecar";

const toolContext = {
  sessionId: "omf-cli",
  cwd: process.cwd(),
  signal: new AbortController().signal,
} as unknown as ToolContext;

const VERSION = "0.1.0";
const args = process.argv.slice(2);
const cwd = process.cwd();
const json = args.includes("--json");
const command = args[0];

function print(value: unknown): void {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function eccCall(operation: string, kind?: string, name?: string): Promise<void> {
  const ecc = await createAppEcc(cwd);
  if (!ecc) throw new Error("ECC is disabled");
  const result = await ecc.tool.execute(
    { operation, kind, name, offset: 0, limit: 50 },
    toolContext,
  );
  if (!result.ok) throw new Error(result.error);
  print(result.output);
}

async function runPrompt(prompt: string): Promise<void> {
  await withSidecar(cwd, async (sidecar) => {
    const { promise: finished, resolve: resolveFinished, reject: rejectFinished } = Promise.withResolvers<void>();
    const autoApprove = args.includes("--yes");
    const sessionId = args.includes("--session") ? args[args.indexOf("--session") + 1] : undefined;
    sidecar.onEvent((event) => {
      if (json) print(event);
      else if (event.type === "message.delta") process.stdout.write(String(event.text ?? ""));
      else if (event.type === "tool.started") {
        const call = event.call as { name?: string } | undefined;
        console.log(`\n[tool] ${call?.name ?? "call"}`);
      } else if (event.type === "error" || event.type === "run_failed") {
        console.error(`\n${event.message ?? "Run failed"}`);
      }
      if (event.type === "approval.requested") {
        const approval = event.approval as { id?: string; reason?: string } | undefined;
        console.error(`\n[approval] ${approval?.reason ?? "Action requires approval"}`);
        sidecar.send({
          type: "approval.respond",
          id: approval?.id,
          decision: autoApprove ? "allow_once" : "deny",
          ...(sessionId ? { sessionId } : {}),
        });
      }
      if (event.type === "session.finished") {
        if (!json) process.stdout.write("\n");
        resolveFinished();
      }
      if (event.type === "error" && !event.sessionId)
        rejectFinished(new Error(String(event.message ?? "Run failed")));
    });
    sidecar.send({
      type: "run",
      prompt,
      ...(sessionId ? { sessionId } : {}),
    });
    await finished;
  });
}

async function main(): Promise<void> {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    print(`Oh My Flecten ${VERSION}\n\nUsage:\n  omf run <prompt> [--json] [--yes] [--session <id>]\n  omf status [--json]\n  omf sessions list\n  omf ecc doctor\n  omf ecc list <skills|agents|commands> [query]\n  omf ecc read <skills|agents|commands> <name>\n  omf rpc\n  omf --version`);
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    print(VERSION);
    return;
  }
  if (command === "doctor" || (command === "ecc" && args[1] === "doctor")) {
    await eccCall("doctor");
    return;
  }
  if (command === "ecc" && args[1] === "list") {
    const ecc = await createAppEcc(cwd);
    if (!ecc) throw new Error("ECC is disabled");
    const result = await ecc.tool.execute(
      { operation: "list", kind: args[2], query: args[3], offset: 0, limit: 50 },
      toolContext,
    );
    if (!result.ok) throw new Error(result.error);
    print(result.output);
    return;
  }
  if (command === "ecc" && args[1] === "read") {
    await eccCall("read", args[2], args[3]);
    return;
  }
  if (command === "status") {
    await withSidecar(cwd, async (sidecar) => print(await sidecar.request({ type: "status" })));
    return;
  }
  if (command === "sessions" && args[1] === "list") {
    await withSidecar(cwd, async (sidecar) =>
      print(await sidecar.request({ type: "sessions.list", limit: 50 })),
    );
    return;
  }
  if (command === "run") {
    const prompt = args.slice(1).filter((arg, index, all) =>
      !["--json", "--yes", "--session"].includes(arg) && all[index - 1] !== "--session",
    ).join(" ");
    if (!prompt) throw new Error("Usage: omf run <prompt> [--json] [--yes] [--session <id>]");
    await runPrompt(prompt);
    return;
  }
  if (command === "rpc") {
    const sidecar = Bun.spawn({
      cmd: agentCommand(),
      cwd,
      env: agentEnvironment(cwd),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await sidecar.exited;
    return;
  }
  throw new Error(`Unknown command: ${command}. Run omf --help.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

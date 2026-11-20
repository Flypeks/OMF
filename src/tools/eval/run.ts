import type { ToolResult } from "../../core/types";
import type { ToolContext } from "../types";
import type { EvalArgs } from "./schema";

const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

const PYTHON_BRIDGE = [
  "import json, sys, traceback",
  'globals()["__omf_print"] = print',
  "while True:",
  "    line = sys.stdin.readline()",
  "    if not line:",
  "        break",
  "    request = json.loads(line)",
  "    stdout = []",
  '    def print(*values, sep=" ", end="\\n", file=None, flush=False):',
  "        if file is None:",
  "            stdout.append(sep.join(str(value) for value in values) + end)",
  "        else:",
  "            __omf_print(*values, sep=sep, end=end, file=file, flush=flush)",
  "    try:",
  '        code = compile(request["code"], "<omf-eval>", "exec")',
  "        exec(code, globals(), globals())",
  '        value = globals().get(request.get("result", "__omf_result"), None)',
  '        sys.stdout.write(json.dumps({"ok": True, "output": "".join(stdout), "result": None if value is None else repr(value)}) + "\\n")',
  "        sys.stdout.flush()",
  "    except BaseException:",
  "        detail = traceback.format_exc()",
  '        sys.stdout.write(json.dumps({"ok": False, "output": "".join(stdout), "error": detail}) + "\\n")',
  "        sys.stdout.flush()",
].join("\n");

const JS_BRIDGE = [
  "let buffer = '';",
  "const pending = [];",
  "let executing = false;",
  "async function execute(line) {",
  "  const request = JSON.parse(line);",
  "  const output = [];",
  "  const localPrint = (...values) => output.push(values.map(String).join(' ') + '\\n');",
  "  try {",
  "    const result = await eval(`(async () => { const print = localPrint; ${request.code} })()`);",
  "    process.stdout.write(JSON.stringify({ ok: true, output: output.join(''), result: result === undefined ? null : String(result) }) + '\\n');",
  "  } catch (error) {",
  "    process.stdout.write(JSON.stringify({ ok: false, output: output.join(''), error: String(error && error.stack ? error.stack : error) }) + '\\n');",
  "  }",
  "}",
  "async function drain() {",
  "  if (executing) return;",
  "  executing = true;",
  "  while (pending.length) {",
  "    const line = pending.shift();",
  "    if (line) await execute(line);",
  "  }",
  "  executing = false;",
  "}",
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data', chunk => {",
  "  buffer += chunk;",
  "  while (true) {",
  "    const newline = buffer.indexOf('\\n');",
  "    if (newline < 0) break;",
  "    const line = buffer.slice(0, newline).trim();",
  "    buffer = buffer.slice(newline + 1);",
  "    if (line) pending.push(line);",
  "  }",
  "  void drain();",
  "});",
].join("\n");

interface EvalKernel {
  process: Bun.Subprocess<"pipe", "pipe", "pipe">;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
  running: boolean;
  runs: number;
}

interface EvalResponse {
  ok?: boolean;
  output?: string;
  result?: unknown;
  error?: string;
}

const kernels = new Map<string, EvalKernel>();
const shutdown = () => {
  for (const kernel of kernels.values()) kernel.process.kill();
  kernels.clear();
};
globalThis.process.once("SIGTERM", shutdown);
globalThis.process.once("SIGINT", shutdown);
globalThis.process.once("exit", shutdown);

function keyOf(context: ToolContext, language: EvalArgs["language"]): string {
  return `${context.sessionId}:${language}`;
}

function start(language: EvalArgs["language"], context: ToolContext): EvalKernel {
  const child = Bun.spawn({
    cmd:
      language === "python"
        ? ["python3", "-I", "-c", PYTHON_BRIDGE]
        : [globalThis.process.execPath, "-e", JS_BRIDGE],
    cwd: context.cwd,
    env: { ...globalThis.process.env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    process: child,
    reader: child.stdout.getReader(),
    decoder: new TextDecoder(),
    buffer: "",
    running: false,
    runs: 0,
  };
}

async function request(kernel: EvalKernel, code: string, result: string): Promise<EvalResponse> {
  kernel.process.stdin.write(`${JSON.stringify({ code, result })}\n`);
  while (true) {
    const newline = kernel.buffer.indexOf("\n");
    if (newline >= 0) {
      const line = kernel.buffer.slice(0, newline);
      kernel.buffer = kernel.buffer.slice(newline + 1);
      return JSON.parse(line) as EvalResponse;
    }
    const chunk = await kernel.reader.read();
    if (chunk.done) throw new Error("eval kernel exited before returning a result");
    kernel.buffer += kernel.decoder.decode(chunk.value, { stream: true });
  }
}

function normalize(output: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) return { text: output, truncated: false };
  return {
    text: Buffer.from(output).subarray(0, MAX_OUTPUT_BYTES).toString("utf8"),
    truncated: true,
  };
}

async function run(args: EvalArgs, context: ToolContext): Promise<ToolResult> {
  const key = keyOf(context, args.language);
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let kernel = kernels.get(key);
  if (!kernel) {
    kernel = start(args.language, context);
    kernels.set(key, kernel);
  }
  kernel.running = true;
  kernel.runs += 1;
  const timer = setTimeout(() => kernel?.process.kill(), timeoutMs);
  try {
    const response = await request(kernel, args.code ?? "", "__omf_result");
    const output = normalize(response.output ?? "");
    return {
      ok: response.ok === true,
      output: output.text,
      ...(output.truncated ? { trailer: "[output truncated at 256KB]" } : {}),
      ...(response.ok === true ? {} : { error: response.error ?? "eval execution failed" }),
      data: {
        kind: "eval",
        language: args.language,
        runs: kernel.runs,
        truncated: output.truncated,
      },
    };
  } catch (error) {
    kernel.process.kill();
    kernels.delete(key);
    return {
      ok: false,
      output: "",
      error: `eval kernel failed: ${error instanceof Error ? error.message : String(error)}`,
      data: { kind: "eval", language: args.language, restarted: true },
    };
  } finally {
    clearTimeout(timer);
    kernel.running = false;
  }
}

export async function runEval(args: EvalArgs, context: ToolContext): Promise<ToolResult> {
  if (args.operation === "status") {
    const kernel = kernels.get(keyOf(context, args.language));
    return {
      ok: true,
      output: JSON.stringify(
        {
          language: args.language,
          running: kernel?.running ?? false,
          runs: kernel?.runs ?? 0,
          persistent: kernel !== undefined,
        },
        null,
        2,
      ),
      data: { kind: "eval", language: args.language, operation: "status" },
    };
  }
  if (args.operation === "reset") {
    const key = keyOf(context, args.language);
    const kernel = kernels.get(key);
    kernels.delete(key);
    kernel?.process.kill();
    return {
      ok: true,
      output: "Kernel reset. The next run starts fresh.",
      data: { kind: "eval", language: args.language, operation: "reset" },
    };
  }
  return run(args, context);
}

import { resolve } from "node:path";

interface SidecarResponse {
  requestId?: string;
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

const PRODUCT_ROOT = resolve(import.meta.dir, "..");

function packagedEccRoot(): string | undefined {
  const override = process.env.OMF_ECC_ROOT?.trim();
  if (override) return override;
  const candidates = [
    resolve(PRODUCT_ROOT, "node_modules", "ecc-universal"),
    resolve(PRODUCT_ROOT, "..", "node_modules", "ecc-universal"),
  ];
  for (const candidate of candidates) {
    if (Bun.file(resolve(candidate, "package.json")).size > 0) return candidate;
  }
  return undefined;
}

export function agentCommand(): string[] {
  const source = resolve(PRODUCT_ROOT, "app/server.ts");
  const compiled = resolve(PRODUCT_ROOT, "dist/flecten-agent");
  const custom = process.env.OMF_AGENT_BIN?.trim();
  return custom
    ? [custom]
    : Bun.file(compiled).size
      ? [compiled]
      : [process.execPath, source];
}

export function agentEnvironment(cwd: string): NodeJS.ProcessEnv {
  const eccRoot = packagedEccRoot();
  return {
    ...process.env,
    OMF_CWD: cwd,
    ...(eccRoot ? { OMF_ECC_ROOT: eccRoot } : {}),
  };
}

export class Sidecar {
  readonly process: Bun.Subprocess<"pipe", "pipe", "inherit">;
  private readonly pending = new Map<string, {
    resolve: (value: SidecarResponse) => void;
    reject: (error: Error) => void;
  }>();
  private readonly listeners = new Set<(event: Record<string, unknown>) => void>();
  private nextId = 1;

  constructor(readonly cwd: string) {
    this.process = Bun.spawn({
      cmd: agentCommand(),
      cwd,
      env: agentEnvironment(cwd),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    void this.readEvents();
    void this.process.exited.then((code) => {
      for (const waiter of this.pending.values())
        waiter.reject(new Error(`OMF agent exited with code ${code}`));
      this.pending.clear();
    });
  }

  private async readEvents(): Promise<void> {
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of this.process.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as Record<string, unknown>;
        const requestId = typeof event.requestId === "string" ? event.requestId : undefined;
        const waiter = requestId ? this.pending.get(requestId) : undefined;
        if (waiter) {
          this.pending.delete(requestId!);
          if (event.ok === false)
            waiter.reject(new Error(String(event.error ?? "OMF command failed")));
          else waiter.resolve(event);
        }
        for (const listener of this.listeners) listener(event);
      }
    }
  }

  onEvent(listener: (event: Record<string, unknown>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(command: Record<string, unknown>): void {
    this.process.stdin.write(`${JSON.stringify(command)}\n`);
  }

  request(command: Record<string, unknown>): Promise<SidecarResponse> {
    const requestId = `omf-${this.nextId++}`;
    const { promise, resolve, reject } = Promise.withResolvers<SidecarResponse>();
    this.pending.set(requestId, { resolve, reject });
    this.send({ ...command, requestId });
    return promise;
  }

  async close(): Promise<void> {
    this.process.stdin.end();
    await this.process.exited;
  }
}

export async function withSidecar<T>(
  cwd: string,
  run: (sidecar: Sidecar) => Promise<T>,
): Promise<T> {
  const sidecar = new Sidecar(cwd);
  try {
    return await run(sidecar);
  } finally {
    await sidecar.close();
  }
}

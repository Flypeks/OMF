# Oh My Flecten

**ECC-native desktop and CLI harness for coding agents.**

Oh My Flecten is a standalone product built on the Flecten 0.1.6 desktop workspace. It keeps the Flecten Talker/Worker runtime, permissions, checkpoints, and desktop IDE, then adds an official ECC operating layer and OMP-grade developer tools.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-b7a1e8)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.4-171717?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?logo=electron&logoColor=white)](https://www.electronjs.org)

## What it adds

| Area | Capability |
|---|---|
| ECC runtime | Official `ecc-universal@2.2.3` dependency and native runtime |
| Skills | Full canonical ECC skill catalog with lazy activation |
| Commands | Canonical ECC slash commands |
| Agents | Converted ECC specialist subagents |
| Rules | Portable engineering rules plus language-specific rules |
| Hooks | Native ECC lifecycle and tool hook bridge |
| CLI | `omf` command for status, sessions, run, RPC, and ECC inspection |
| Eval | Persistent JavaScript and Python kernels per session |
| Safety | Flecten permissions, approvals, sandbox, checkpoints, and event journal remain authoritative |

## Install and run

Requires Bun 1.4 or newer.

```bash
bun install
bun run cli -- --version
```

Desktop app:

```bash
export OPENAI_API_KEY=...
bun run app:dev
```

CLI:

```bash
bun run cli -- status --json
bun run cli -- ecc doctor
bun run cli -- ecc list skills
bun run cli -- ecc read skills python-patterns
bun run cli -- run "Inspect this repository and report risks" --json
bun run cli -- rpc
```

Provider keys use `OMF_*` first, with `FLECTEN_*` and `LIQUID_*` compatibility:

```bash
OMF_PROVIDER=anthropic OMF_MODEL=claude-sonnet-4-6 bun run app:dev
```

## CLI reference

| Command | Purpose |
|---|---|
| `omf --version` | Product version |
| `omf status [--json]` | Live agent status and configuration |
| `omf sessions list` | Recent sessions |
| `omf run <prompt> [--json] [--yes] [--session <id>]` | Run a prompt through the sidecar |
| `omf rpc` | Raw JSONL protocol over stdio |
| `omf ecc doctor` | ECC integration diagnostics |
| `omf ecc list <kind> [query]` | Search skills, agents, or commands |
| `omf ecc read <kind> <name>` | Read one canonical ECC asset |

## Development

```bash
bun test
bun run check
bun run lint
bun run build:ui
bun run build:agent
```

A change is complete only when the relevant checks pass and the behavior is covered.

## License

AGPL-3.0. The product includes MIT-licensed ECC assets and preserves their notices.

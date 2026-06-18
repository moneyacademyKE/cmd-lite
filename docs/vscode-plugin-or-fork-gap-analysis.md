# VS Code Plugin vs. VS Code Fork — Gap Analysis for Command Code

## TL;DR

**Build an unofficial, community-driven VS Code extension that wraps the existing `cmd` CLI.** Do NOT fork VS Code. Since we do not control the proprietary `cmd` binary, the extension acts as an orchestrator—borrowing ideas like parallel agent coordination from open-source tools like Kilo Code—while relying on the CLI for the core `taste-1` capabilities.

---

## What Command Code Actually Is

From the launch docs (`commandcode.ai/launch`) and npm (`command-code@0.25.5`):

- **Single binary**, installable via `npm i -g command-code`, invoked as `cmd`.
- **Proprietary** (built by Command Code, Inc.; Langbase-backed). Source is not open. The CLI is the product surface.
- **Core differentiator:** `taste-1`, a meta neuro-symbolic architecture that turns every accept/reject/edit into a signal. Learned preferences land in `.commandcode/taste/taste.md` (and category files under `.commandcode/taste/{category}/taste.md`).
- **Extensibility surface:** Skills (slash commands), MCP (Model Context Protocol), Plugins, Headless mode (`cmd` can be piped/scripted), Studio (cloud profiles, team sharing via `npx taste push/pull`).
- **Multi-model:** Claude, GPT, Kimi, DeepSeek, GLM, Qwen, plus BYO key (Anthropic, OpenAI, Bedrock, Vertex).
- **Interactive shell:** REPL with shortcuts (`Ctrl+T` opens taste panel), commands, modes.

In other words: the CLI owns taste, generation, and session state. The editor should *not* re-implement any of that.

---

## What Already Exists in the Editor Space

| Product | Type | Model | What it does | Source |
|---|---|---|---|---|
| **Claude Code VS Code ext.** | First-party wrapper extension | Claude only | Bundles the Claude Code CLI; chat panel; diffs with permission gates; `@`-mentions; session history. Does NOT fork VS Code. | `code.claude.com/docs/en/vs-code` |
| **Claude Code Chat** (AndrePimenta) | Community extension | Claude only | Beautiful chat UI wrapping the CLI. | VS Code Marketplace |
| **VS Code Chat Participant API** | VS Code native | Any model via Copilot | Built-in `@vscode`, `@terminal`, `@workspace`. Extensible for third parties. | `code.visualstudio.com/api/extension-guides/ai/chat` |
| **Copilot third-party agents** | VS Code native | Multiple | VS Code supports registering alternate agents (e.g., Claude via Copilot). | `code.visualstudio.com/docs/copilot/agents/third-party-agents` |
| **Codium / Cursor / Windsurf** | Full editor forks | Varies | They fork VS Code because they need deep editor control (custom completion engine, embedded inference, AI-first UX). | — |

**Key takeaway:** Even Anthropic — with the deepest possible Claude Code integration — chose *extension*, not fork. Cursor is the canonical example of when fork is justified (custom completion + AI-native editor shell).

---

## Gap Analysis: Extension (Wrapper `cmd`) vs. Fork (Codium-style)

### Option A — VS Code Extension (Recommended)

A TypeScript extension that shells out to `cmd` and renders:
- Chat participant via `vscode.chat.createChatParticipant`
- Webview panel for diffs/permission prompts (replaces TUI prompts with native editor UI)
- Sidebar view showing `.commandcode/taste/taste.md` live, with inline editing
- Status bar item with active session state
- Commands: `cmd.start`, `cmd.headless "<task>"`, `cmd.taste.push`, `cmd.taste.pull`, `cmd.plan`
- Tasks provider to surface `cmd` actions in the command palette
- Optional: use `--output-format json` / NDJSON streaming protocol if exposed

**Implementation Status (Current Repository):** 
Significant portions of this v1 are already built in the current `command-code-vscode` repository. The extension already sets up an IPC Context Server to feed editor state to `cmd`, provides a Chat Participant with Language Model Tools, and renders the Taste tree.

**Capability matrix:**

| Capability | Status | Notes |
|---|---|---|
| Chat Participant API | **Done** | `vscode.chat.createChatParticipant('@cmd')` and Language Model Tools are registered. |
| IPC Context Server | **Done** | Extension opens a socket for `cmd` to fetch open files, diagnostics, and git context. |
| Taste visibility | **Done** | `TasteTreeProvider` and `registerTasteWatcher` provide live reload. |
| Headless scripting | **Done** | `vscode.tasks.registerTaskProvider` is wired up. |
| Run `cmd` in any directory | **Done** | Core session commands (`start`, `resume`) manage CLI invocation. |
| Multi-model selection | **Done** | `commandcode.model.pick` command is implemented. |
| Parallel Agents | **Gap** | Needs a new module to orchestrate multiple `cmd --headless` parallel subprocesses. |
| Inline diff preview | **Gap** | Needs implementation for routing `cmd` output to `vscode.diff()`. |
| Permission gates | **Gap** | Needs custom Webview panel to replace TUI prompts. |
| Crash recovery | **Done** | Session tracking and `removeSessionFile` logic is in place. |

**Pros:**
- 1–2 orders of magnitude less code than a fork.
- Reuses every Command Code release automatically (just bump the bundled CLI version).
- Works on every VS Code fork (VSCodium, Cursor, Windsurf, Trae) because they all support the Extension API.
- No license entanglement: extension is MIT, calls proprietary binary at runtime.
- Taste becomes a *first-class VS Code concept*, not a hidden file.

**Cons:**
- UI is gated by what the CLI exposes over stdio / flags. If `cmd` doesn't emit structured events, we have to regex stdout.
- Latency: one IPC hop per turn. Negligible for code-gen, painful for inline-completion-style UX.
- Can't intercept editor events at the level Cursor does (e.g., "complete this mid-token").

### Option B — VS Code Fork (Codium-style)

Fork `microsoft/vscode`, rebrand, replace parts of the workbench to embed `cmd` (or a taste-1-aware harness) into the chrome.

**Implementation effort:** 6–18 months minimum, plus ongoing merge burden from upstream VS Code (every release is a multi-week conflict resolution cycle — Cursor and Windsurf employ full-time platform teams for this).

**Capability matrix:**

| Capability | Coverage | Notes |
|---|---|---|
| Everything in Option A | Full | You're a superset, with a much higher cost floor. |
| Inline completions powered by taste | Possible | Hook the inline-completion provider; condition prompts with taste constraints. |
| AI-native editor shell | Possible | Replace new-file templates, command palette ranking, search results with taste-aware variants. |
| Embedded inference | Possible | Bundle a quantized model for offline taste scoring. |
| Custom renderer | Possible | e.g., render acceptance-rejection UI inline. |
| Agent View parallel sessions | Possible | Native multi-panel UI. |

**Pros:**
- Maximum control. You can make every keystroke taste-aware.
- Differentiated UX (Cursor's "every surface is AI" story).
- IP defensibility — your editor IS your product.

**Cons:**
- Massive ongoing cost. Cursor has ~50 engineers doing this. Are you prepared to fund that?
- Lose VS Code's release cadence. Security patches lag upstream.
- Narrow the addressable market: only users who switch editors, not the 80%+ of devs already on VS Code.
- Doesn't help the *core* taste loop unless you also rebuild the harness.
- License: VS Code is MIT, but VSCodium/Cursor rebuilds must respect Microsoft trademarks and marketplace policies.

### Option C — Hybrid: Extension + Local Companion Daemon

A VS Code extension that talks to a small companion process (Node binary) bundled alongside, which wraps `cmd` and exposes:
- NDJSON over stdio (richer than `cmd`'s native output)
- Local file watching of `.commandcode/taste/`
- Persistent session store
- Optional LSP for inline completions

**Best of both worlds**, but only worth it once Option A's IPC limits become a real bottleneck. Not justified for v1.

---

## Decision Matrix

| Criterion | Weight | Option A (Extension) | Option B (Fork) |
|---|---|---|---|
| Time to v1 | High | 2–6 weeks | 6–18 months |
| Maintenance burden | High | Low (rebuild for new `cmd`) | High (rebase VS Code monthly) |
| Taste as first-class IDE concept | High | Excellent | Excellent |
| Beat Claude Code's extension | High | Yes (multi-model + taste UX wins) | Yes (deeper, but slower) |
| Addressable market | High | All VS Code users (~80% of devs) | Subset willing to switch editors |
| Inline completion with taste | Medium | Out of scope (v1) | Yes |
| Team taste push/pull | High | Trivial via commands | Trivial via commands |
| Plan mode integration | High | Native markdown rendering | Native markdown rendering |
| IP defensibility | Medium | Low | High |
| Risk | — | Low | High |

**Recommendation: Option A.** Reassess fork only if (a) inline completion becomes a flagship feature and (b) the `cmd` CLI can't be made to expose the right events.

---

## What Would Make Option B Worth Considering

A fork only pays for itself when *the editor itself is the product*. Triggers:

1. **Taste-conditioned inline completion** — multi-token suggestions that respect taste constraints. Needs inline-completion provider hooks.
2. **AI-first command palette / search** — every search result is a "do this with taste" action.
3. **Embedded inference for offline taste scoring** — on-device model that runs in the renderer.
4. **Multi-agent workspace** — multiple `cmd` sessions in parallel panels, native orchestration.
5. **Regulatory / on-prem requirement** — air-gapped enterprises need an editor that ships taste + models + CLI as one bundle.

If any two of these are real product requirements in the next 12 months, start scoping the fork in parallel. Otherwise, ship the extension.

---

## Proposed v1 Scope (Option A)

**Repo structure:**
```
command-code-vscode/
├── src/
│   ├── extension.ts           # activate(), registers commands + chat participant
│   ├── cli/
│   │   ├── spawn.ts           # spawn `cmd` with cwd, env, args
│   │   ├── parse.ts           # NDJSON / line parser
│   │   └── session.ts         # session lifecycle, resume
│   ├── chat/
│   │   ├── participant.ts     # vscode.chat.createChatParticipant('@cmd')
│   │   └── tools.ts           # tool definitions (read_file, run_cmd, etc.)
│   ├── taste/
│   │   ├── treeView.ts        # TreeView of .commandcode/taste/
│   │   ├── watcher.ts         # FileSystemWatcher for live reload
│   │   └── commands.ts        # push, pull, edit, reset
│   ├── diff/
│   │   └── webview.ts         # diff preview + permission gates
│   └── ui/
│       └── statusBar.ts       # session state indicator
├── package.json
└── README.md
```

**Key APIs to use:**

| API | Purpose |
|---|---|
| `vscode.chat.createChatParticipant('@cmd', handler)` | Register as a chat participant (LLM-free; we route to `cmd`). |
| `vscode.workspace.registerTextDocumentContentProvider` | Virtualize `.commandcode/taste/*.md` for inline editing. |
| `vscode.window.registerTreeDataProvider` | Taste sidebar. |
| `vscode.window.showWebviewPanel` + custom HTML | Diff + permission UI. |
| `vscode.tasks.registerTaskProvider` | Headless `cmd` runs. |
| `child_process.spawn('cmd', [...args], { cwd })` | CLI invocation. |
| `vscode.workspace.createFileSystemWatcher('**/.commandcode/taste/**')` | Live taste reload. |

**Critical Reverse-Engineering Tasks (since we are an unofficial wrapper):**

1. **Output Parsing:** Does `cmd` support a hidden `--output-format json` flag? If not, we must write a robust regex/ANSI parser to extract state from the non-TTY stdout stream.
2. **Session Hijacking:** Can we discover the session persistence format (e.g., sqlite or json in `~/.commandcode/`) to offer `--resume <sessionId>`?
3. **Auth Passthrough:** For `taste push/pull`, we must rely on the user having authenticated via their terminal first, as we cannot easily intercept the OAuth flow.
4. **Binary Resolution:** We must require users to install the binary themselves (`npm i -g command-code`) and resolve it from PATH, as we cannot legally bundle the proprietary binary.
5. **Skill Discovery:** We need to reverse-engineer how `cmd` discovers skills (likely `.commandcode/skills/<name>/SKILL.md`) to surface them in the extension UI.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CLI emits only ANSI TUI, not machine-readable | Write a robust ANSI stripper and state machine to parse the interactive output stream. |
| Proprietary CLI changes break extension | Pin to a known version in `package.json`; surface a clear "update CLI" prompt. |
| Extension on Cursor/Windsurf forks | The Extension API is compatible; test on VSCodium monthly. |
| Taste file conflicts in team workflows | Surface `.commandcode/taste/taste.md` as a code-reviewable file (PR-aware). |
| Slow IPC for long-running tasks | Use `--headless` mode for fire-and-forget; show progress in status bar. |
| Extension marketplace review for proprietary binary call | Marketplace allows shelling out; document `cmd` as an external dependency. |

---

## What I Would NOT Do

- **Don't fork VS Code.** Not yet. The cost is enormous and the taste system is upstream in `cmd`.
- **Don't re-implement taste learning in the extension.** It's a black box in `cmd`; the extension is a viewer + runner.
- **Don't write a custom renderer for terminal output.** Convert to Markdown + use VS Code's chat API.
- **Don't try to compete with Cursor on inline completion in v1.** That's a different product.

---

## Rich Hickey Gap Analysis: Kilo Code vs. Command Code

A specific comparison against the Kilo Code VS Code extension using a Rich Hickey (Simplicity vs. Easiness) lens reveals critical architectural decisions.

### Feature Set Differences

| Feature | Kilo Code | Command Code | Difference |
|---|---|---|---|
| **Architecture** | Editor Extension + Heavy Client Logic | Thin Wrapper + CLI (State in `cmd`) | Kilo Code integrates deeply with editor hooks (complected). Command Code leverages purely data-driven communication via the CLI. |
| **Agent Execution** | Parallel Agents | Sequential REPL | Kilo Code spins up concurrent agents (impl, test, doc). Command Code currently enforces sequential "taste" chunks. |
| **Model Breadth** | 500+ via OpenRouter | Curated Top-Tier | Kilo Code maximizes breadth (accidental complexity). Command Code optimizes for specific capabilities. |
| **Inline Autocomplete** | Yes | No | Kilo Code adds "copilot" style inline code completion, bypassing the meta-taste loop for micro-edits. |

### Complexity vs. Utility

| Capability | Utility | Complexity | Type | Verdict |
|---|---|---|---|---|
| Parallel Agents | High | Medium | Essential (Concurrency) | **Adopt.** Parallel agents that synchronize on an immutable `taste.md` event log drastically reduce latency without complecting editor state. |
| Inline Autocomplete | Medium | High | Accidental (Editor Hooks) | **Reject.** Inline completions inject noise into the taste loop and require deep editor hook integration, moving away from simple CLI encapsulation. |
| MCP Servers | High | Low | Essential | **Adopt.** Both platforms share this, confirming its value as a simple, decomplected standard. |

### Actionable Recommendation against Kilo Code
As an unofficial extension, we cannot modify the `cmd` binary. Therefore, we must implement Kilo Code's best ideas at the extension layer:
1. **Adopt Parallel Agents via Extension Orchestration:** The VS Code extension itself will spawn multiple parallel `cmd --headless` subprocesses (e.g., one for tests, one for docs). The extension acts as the coordinator, managing the merge queue and ensuring all processes read from the same immutable `taste.md`.
2. **Reject Inline Autocomplete:** It requires an LSP or deep CLI integration. Since we don't control `cmd`, injecting inline completions would require a separate LLM call, breaking the unified `taste-1` architecture. We reject it to maintain simplicity.

---

## Verdict

**Build the extension. Hold the fork as a 12-month-out option.** The Claude Code extension is the proof point: even the team with the deepest possible integration chose wrapper, not fork. Your wedge is taste + multi-model + team workflows — none of which require editor-level surgery.

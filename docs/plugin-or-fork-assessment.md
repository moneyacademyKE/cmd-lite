# VS Code Plugin vs. VS Code Fork — Updated Assessment (June 2026)

> Original analysis at `~/.commandcode/plans/vscode-plugin-or-fork-gap-analysis.md`
> This update reflects the extension's current implementation state after the combined gap-analysis + bridge-gap roadmap implementation.

---

## Current Implementation Status

The original analysis recommended **Option A (Extension)** with a v1 capability matrix. Here's where we stand:

| Capability | Original Status | Current Status | Notes |
|---|---|---|---|
| Chat Participant API | **Done** | **Done** | `@cmd` with streaming, cancellation, contextual followups, slash commands |
| Language Model Tools | Not planned | **Done** | 6 registered LM tools (runPrint, getTaste, getDiagnostics, getGitContext, getOpenFiles, listModels) |
| IPC Context Server | **Done** | **Done** | Unix socket, token auth, git context, debounced selection updates |
| Taste visibility | **Done** | **Done** | TreeView + FileSystemWatcher + inline preview |
| Headless scripting | **Done** | **Done** | `vscode.tasks.registerTaskProvider` with Pseudoterminal |
| Run `cmd` in any directory | **Done** | **Done** | `createTerminal` for interactive, `spawn` for headless, multi-workspace support |
| Multi-model selection | **Done** | **Done** | QuickPick from `cmd --list-models` |
| Parallel Agents | **Gap** | **Still Gap** | No multi-`cmd` orchestration module |
| Inline diff preview | **Gap** | **Still Gap** | No `vscode.diff()` integration |
| Permission gates | **Gap** | **Still Gap** | No custom Webview for permission prompts |
| Crash recovery | **Done** | **Done** | Session file lifecycle, cleanup on deactivate |
| CLI validation | Not planned | **Done** | `validateCliPath()` + version check on activate |
| Config reactivity | Not planned | **Done** | `onDidChangeConfiguration` for cliPath, showStatusBar |
| Git context in IPC | Not planned | **Done** | Branch, HEAD commit, dirty files |
| ANSI handling | Implicit | **Done** | `stripAnsi` wired into chat stream + OSC hyperlinks |
| Socket authentication | Not planned | **Done** | UUID token handshake, 5s timeout, session file token |
| Session history sidebar | Not planned | **Done** | Reads `~/.commandcode/projects/` metadata |
| Chat history persistence | Not planned | **Done** | `context.globalState` for model/permission/plan state |
| Tests | Not planned | **Done** | 33 tests, `npm test` works, vitest configured |
| Keybindings | Not planned | **Done** | `Cmd+Shift+\`` for start session |
| Debug config | Not planned | **Done** | `.vscode/launch.json` + `.vscode/tasks.json` |

---

## Remaining Original Gaps (3)

These are the original "Gap" items that are still open:

1. **Parallel Agents** — Multi-`cmd` orchestration. Requires a module that spawns N parallel `cmd --headless` subprocesses and merges their output. The IPC context server would need to serve context to all agents.
2. **Inline diff preview** — Routing `cmd` output to `vscode.diff()` or a Webview showing before/after. Currently outputs in markdown via chat or plain text in output channel.
3. **Permission gates** — CLI permission prompts (trust, file writes) appear in the terminal. A custom Webview could intercept and render these inline.

---

## Reverse-Engineering Tasks — Updated Status

| Task | Status |
|---|---|
| Output parsing: JSON format? | `--output-format json` not confirmed. ANSI stripped via regex. |
| Session persistence format | Confirmed: `~/.commandcode/projects/{slug}/{uuid}.jsonl` with JSONL metadata per session. |
| Auth passthrough | Works — `cmd login` is terminal-based; extension launches terminal. |
| Binary resolution | Implemented — `validateCliPath()` checks existence + executability + version floor. |
| Skill discovery | Not yet reverse-engineered. `.commandcode/skills/{name}/SKILL.md` is the likely format. |

---

## Option B Triggers — Updated Assessment

The original analysis listed 5 triggers for reconsidering a fork. Let's evaluate each against current state:

1. **Taste-conditioned inline completion** — Not implemented. No LSP/InlineCompletionProvider integration. Would require a separate LLM call, breaking the unified taste loop. **Assessment: Reject for now.**

2. **AI-first command palette / search** — Not implemented. Requires editor-level hooks. **Assessment: Extension API insufficient without fork.**

3. **Embedded inference for offline taste scoring** — Not supported by the `cmd` CLI architecture. **Assessment: Can't do without fork.**

4. **Multi-agent workspace** — Still a gap, but achievable without fork via the extension orchestrating parallel `cmd` processes. **Assessment: Extension sufficient.**

5. **Regulatory / on-prem requirement** — Not yet a product requirement. **Assessment: Not triggered.**

**Verdict:** None of the 5 fork triggers are active. The extension is the right architecture.

---

## Rich Hickey Lens — Kilo Code Comparison (Updated)

| Feature | Kilo Code | Command Code Extension (Current) | Verdict |
|---|---|---|---|
| **Architecture** | Editor Extension + Heavy Client Logic | Thin Wrapper + CLI | Command Code is simpler |
| **Agent Execution** | Parallel Agents | Sequential REPL (no parallel orchestration yet) | Gap: Kilo Code wins on concurrency |
| **Model Breadth** | 500+ via OpenRouter | Curated Top-Tier via `cmd` | Trade-off: breadth vs curation |
| **Inline Autocomplete** | Yes | No | Rejected per original analysis |
| **LM Tools** | Unknown | 6 registered tools | Command Code leads on composability |
| **IPC Context** | Unknown | Full Unix socket server with auth | Command Code leads |
| **Tests** | Unknown | 33 tests, vitest | Demonstrated commitment to quality |

**Actionable recommendation:** The one Kilo Code feature worth adopting in this architecture is **parallel agent orchestration**. The extension already manages session lifecycle and IPC — adding a coordinator that spawns N `cmd` processes and merges results would close the biggest remaining competitive gap without complecting the architecture.

---

## What's Next (Weighted)

| Priority | Item | Effort | Impact |
|---|---|---|---|
| 1 | Parallel agent orchestration | High | High — closes #1 Kilo Code gap |
| 2 | Inline diff preview via Webview | Medium | High — professionalizes code review UX |
| 3 | Permission gate Webview | Medium | Medium — removes TUI dependency |
| 4 | Skill discovery UI in sidebar | Low | Low — surfaces `.commandcode/skills/` |
| 5 | Integration test suite | High | Medium — catches CLI regressions |

**Bottom line:** The extension architecture was the right call. The implementation has now closed all "Done" items from the original matrix plus 10 items that weren't even planned. The three remaining gaps (parallel agents, diff preview, permission gates) are all achievable within the extension model — no fork needed.

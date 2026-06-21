# CMD Lite Visual Parity Playbook

> A living reference for maintaining pixel-perfect visual parity between the `cmd` CLI TUI and the CMD Lite VS Code extension webview.

## Core Principle

The webview should render every visual element the CLI TUI renders, in the same order, with the same styling conventions (uppercase labels, `# ` prefixed metadata, `─` separators, `❯` prompts, `✻` thought indicators, `⠶` response bullets).

## Visual Parity Checklist

### Header

| Element | CLI | Webview | Test |
|---------|-----|---------|------|
| ASCII art CMD logo | 5-line block art | Compact 5-line in `.header-logo` | `has CMD ASCII art logo` |
| Version | `# v0.39.0` | `#header-version` with `# ` CSS prefix | `has #-prefixed version span` |
| Models | `# models: ... · taste-1` | `#header-models` with `# ` CSS prefix | `has #-prefixed models span` |
| CWD | `# ~/path` | `#header-cwd` with `# ` CSS prefix | `has #-prefixed CWD span` |
| Token count | Not shown in CLI header | `#token-count` in metrics bar | — (CMD Lite addition) |
| Model name | In models line | `#model-name` in metrics bar | — (CMD Lite addition) |
| Permission mode | Not in header | `#perm-mode` in metrics bar | — (CMD Lite addition) |
| Crosshairs | Not applicable (terminal) | 4 corners via `.crosshair` | `has crosshair decorations` |
| CRT scan-line | Not applicable (terminal) | `body::after` overlay | `has CRT scan-line overlay` |
| Grid background | Not applicable (terminal) | 20px grid via `background-image` | `has grid background` |

### Action Bar (CMD Lite addition)

| Button | Icon | Action |
|--------|------|--------|
| START | ▶ | Start new session |
| CONTINUE | ↻ | Continue last session |
| SESSIONS | ☰ | Show session list |
| AGENTS | ⚑ | Show agents board |
| CTX | ☰ | Toggle context sidebar |
| MODEL | ⚙ | Pick model |
| PERM | ⚙ | Pick permission |
| STATUS | ℹ | Show status |

### Message Area

| Element | CLI | Webview | Test |
|---------|-----|---------|------|
| User prompt | `❯ message` | `.message-user` with ❯ border | — |
| Thought block | `✻ Thought for X seconds [ctrl+o to expand]` | `<details class="step-accordion">` with ✻ CSS prefix | `has ✻ prefix via CSS`, `renders duration` |
| Duration format | "1 second" / "X seconds" | Same via `formatThoughtDuration()` | `uses "second/seconds" format` |
| Response bullet | `⠶ content` | Prepended via `appendMessage()` | `prepends ⠶` |
| Code blocks | Syntax highlighted in terminal | Token-based highlighting (comment, string, keyword, number) + COPY button | `has syntax highlighting`, `has code copy buttons` |
| Tool calls | `<tool_call>` with name header | `.tool-call` widget with header + body | `renders tool call widgets` |
| Results | `<result>` with content | `.tool-result` widget | `renders result widgets` |
| Diff blocks | ````diff` colored output | `.diff-block` with green/red lines, accept/reject buttons | `renders diff blocks` |

### Input Area

| Element | CLI | Webview | Test |
|---------|-----|---------|------|
| Top separator | `─` full width | `.chat-input-container::before` gradient line | `has CLI-style separator` |
| Prompt character | `❯` | `.input-prompt` span | `has ❯ input prompt character` |
| Text entry | Inline input | `<textarea>` | — |
| Placeholder | `Ask your question...` | Same | `has "Ask your question..."` |
| Bottom separator | `─` full width | `.input-prompt-row::after` gradient line | `has second separator` |
| Shortcut help | `? for shortcuts` | `.tui-shortcut-help` text | `has "? for shortcuts"` |
| Learning status | `[ctrl+t] continuous learning` | `.tui-learning-status` text | `has "[ctrl+t] continuous learning"` |
| TASTE toggle | `◻ TASTE` / `☑ TASTE` | `.tui-taste-toggle` interactive toggle | `has TASTE toggle` |
| Execute button | Not in CLI | `#send-btn` with ❯ Execute | `has ❯ prefix on send button` |

### Footer Bar (CMD Lite addition)

| Item | Content |
|------|---------|
| MODEL | `MODEL // deepseek-v4-pro` |
| MODE | `MODE // STANDARD` |
| Tokens | `T // P 0 / C 0 / 0` |
| Session | `SESSION // a1b2c3d4` |
| Turn | `TURN // 0` |
| Streaming | Blinking cursor + connection dot |

### Streaming Status

| Element | CLI | Webview | Test |
|---------|-----|---------|------|
| Status line | `❯ response` → thought → result | `#tui-active-status` with spinner | `has Hypothesizing status line` |
| Spinner | Braille frames | Rotating frames `[o, O, o, .]` | `has spinner that rotates` |
| Duration | `• 5s` | Same via `formatDuration()` | `tracks duration` |
| Token count | `• ↓ 123` | Same via `tokensEl.innerHTML` | `tracks token count` |

### Keyboard Shortcuts

| Shortcut | Action | Test |
|----------|--------|------|
| Shift+Tab | Cycle permission mode | `handles Shift+Tab` |
| Ctrl+T | Toggle continuous learning | `handles Ctrl+T` |
| Ctrl+O | Toggle expanded thought blocks | `handles Ctrl+O` |
| Alt+P (Opt+P) | Switch model | `handles Alt+P` |
| Ctrl+G | Open input in external editor | `handles Ctrl+G` |
| Esc | Interrupt execution | `handles Escape` |
| Esc ×2 | Rewind to last checkpoint | `handles Escape` |

### Slash Commands

| Command | Handler | Test |
|---------|---------|------|
| `/clear` | Local (clear messages) | `handles /clear locally` |
| `/help` | Local (show guide) | `handles /help locally` |
| `/plan <task>` | Local routing to CLI | `handles /plan with CLI routing` |
| `/sessions` | Local (show panel) | `handles /sessions locally` |
| `/agents` | Local (show panel) | `handles /agents locally` |
| All others | Routed to CLI | `routes unknown slash commands` |

### Panels

| Panel | Content | Test |
|-------|---------|------|
| Chat | Message history + input | `has chat panel` |
| Sessions | Recent session list | `has sessions panel` |
| Agents | Kanban board (planning, execution, verification) | `has agents panel` |
| Status | Terminal chrome with ANSI-colored output | `has status panel` |
| Context sidebar | Git, files, diagnostics | `has toggleable context sidebar` |

## Running Verification

```bash
# Run all regression tests (138 tests across 15 files)
npm test

# Run typecheck
npm run typecheck

# Build extension
npm run build

# Package VSIX
npm run package
```

## Playwright Visual Tests

The standalone test page at `scripts/visual-test.html` renders the webview outside VS Code for visual inspection. To compare with the CLI TUI:

```bash
# Build the webview first
npm run build

# Generate standalone page and take screenshots
node scripts/final-capture.mjs
```

This produces:
- `scripts/final-webview.png` — The webview rendered in a headless browser
- `scripts/final-comparison.png` — Side-by-side with CLI reference

## Preventing Regression

When modifying the webview:

1. **Check the regression test file**: `src/__tests__/webview-regression.test.ts` (65 tests)
2. **Run `npm test`** before committing — all 138 tests must pass
3. **Run `npm run typecheck`** — zero type errors
4. **Run `node scripts/final-capture.mjs`** — visually verify side-by-side
5. **Build the VSIX** with `npm run build` then `npx vsce package`

If adding a new visual element:
1. Add it to `main.ts` HTML template
2. Add CSS in `style.css`
3. Add regression test in `webview-regression.test.ts`
4. Update the checklist above
5. Verify with Playwright screenshots

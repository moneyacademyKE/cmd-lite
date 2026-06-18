# Rich Hickey Gap Analysis: Webview UI vs CLI Wrapper

## Overview
This gap analysis evaluates the proposal to add a rich, Kilo Code-style sidebar UI (Webview) to the `cmd lite` VS Code extension. The analysis is conducted through the lens of Rich Hickey's "Simple Made Easy" philosophy—prioritizing unentangled components, clear state management, and deliberate separation of time and identity.

## Feature Set Differences

| Feature Category | Current `cmd lite` (CLI Wrapper) | Proposed `cmd lite` with Webview (Kilo Code Style) |
| :--- | :--- | :--- |
| **User Interface** | Integrated VS Code Terminal & Command Palette. | Dedicated custom sidebar (Webview) with rich HTML/CSS/JS. |
| **Model Selection** | Configured via CLI flags or config file. | Visual dropdown selection directly in the UI. |
| **Interaction Model** | Command-line prompts (`cmd -c`). | Continuous chat-like interface with inputs and buttons. |
| **Metrics & Telemetry** | Logged to terminal output or hidden in metadata. | Visual token counters and progress bars in real-time. |
| **Action Feedback** | Text-based logs. | Actionable buttons (Copy, Accept/Reject diffs, Thumbs up/down). |
| **Session Management** | Managed via filesystem (`~/.commandcode`) and CLI flags (`-r`). | Visual session selector, "New Session" buttons, Worktree actions. |

## Explaining the Differences
1. **User Interface**: The current approach leverages the native terminal, which is "easy" (familiar to developers) and "simple" (requires no extra UI code). The proposed Webview introduces a frontend application running inside VS Code, adding visual affordances but tangling the extension with a frontend framework.
2. **Model Selection**: Currently, changing models means editing a config or passing a flag. A UI dropdown makes this instantaneous and visually apparent without context switching.
3. **Interaction Model**: A terminal is sequential and text-based. A Webview is stateful, component-based, and event-driven.
4. **Metrics & Action Feedback**: Webviews can render complex, formatted UI elements (like token graphs or diff accept buttons) that are impossible or clunky in standard terminal output.

## Benefits and Trade-offs

### Benefits of Kilo Code-Style UI
- **Discoverability**: Features like models, worktrees, and sessions are immediately visible rather than hidden behind `--help`.
- **"Vibe Coding" Workflow**: Reduces the cognitive load of remembering CLI syntax, enabling a more fluid, conversational development loop.
- **Rich Rendering**: Code blocks, markdown, and diffs are rendered beautifully, improving readability.

### Trade-offs (The Hickey Perspective)
- **State Entanglement**: A Webview introduces a new stateful layer. Now the UI has a state (e.g., "is loading", "selected model"), the VS Code extension has a state, and the `cmd` CLI has a state. Syncing these three is a major source of bugs (braiding/complecting).
- **Maintenance Burden**: We transition from maintaining a thin IPC wrapper to maintaining a full frontend application.
- **Performance**: Webviews consume more memory and have an IPC overhead compared to direct terminal execution.

## Complexity vs Utility

| Component/Feature | Complexity (Hickey Scale) | Utility / Value | Score |
| :--- | :--- | :--- | :--- |
| **Native Terminal Integration** | Low (Simple, decoupled) | High (Fast, scriptable) | High |
| **Rich Webview Chat Panel** | High (Entangles UI state with CLI) | High (Discoverability, UX) | Medium-High |
| **Webview as a Dumb Renderer** | Medium (Requires IPC bridge, but unentangles state) | High (Rich UX without state bugs) | Very High |
| **Visual Model Selection** | Low (if purely sending config payload) | High (UX flexibility) | High |

## Actionable Recommendation

**Weighted Analysis:**
- **Power/New Capabilities**: High (Unlocks visual diffs, token graphs, immediate context actions).
- **Speed**: Medium (Requires building a frontend bundle and IPC bridge).
- **Complexity**: High if state is duplicated; Medium if state is strictly centralized.
- **Trade-offs**: The value of the UI outweighs the maintenance cost, *provided* we adhere to Rich Hickey's principles.

**Recommendation: The "Thin Glass" Webview Pattern**
We should implement the Webview UI, but we **must not** duplicate state in the frontend. 
1. **Centralized State**: The `cmd` CLI remains the single source of truth for identity and state.
2. **Dumb Renderer**: The Webview is "Thin Glass". It simply renders a stream of UI events (e.g., `UpdateTokens(14.8k)`, `RenderMessage(...)`) dispatched from the CLI through the extension.
3. **Event-Driven Input**: UI interactions (dropdowns, clicks, typing) do not mutate Webview state directly. They emit events (`ModelSelected(Nex-N2-Pro)`) to the CLI. The CLI updates its internal state and emits a new render payload.

This approach gives us the rich UX of Kilo Code while maintaining the unentangled, simple architecture demanded by the Rich Hickey philosophy.

## Implementation Path (Next Actions)
1. **Webview Provider**: Scaffold a `WebviewViewProvider` in `extension.ts` for the sidebar panel.
2. **Frontend Build**: Set up `esbuild` to compile a minimal vanilla JS or simple component UI (no heavy frameworks like React if possible, keeping it Simple).
3. **IPC Bridge**: Extend the current UDS/IPC mechanism so the CLI can stream structured JSON-RPC UI payloads to the Webview.
4. **TDD (Red/Green)**: Write Babashka tests for the UI event payload generation before implementing the CLI side.

# Architectural Playbook: CommandCode+

This document serves as the authoritative, comprehensive **Architectural Playbook** for the **CommandCode+** project. It outlines our design philosophies, systems architecture, coding standards, and verification guidelines.

---

## 🧠 Core Philosophy: Rich Hickey's Simplicity

CommandCode+ is designed according to **Rich Hickey's Simplicity** guidelines (i.e. *decomplecting* concerns). We reject the traditional approach of building "easy" (convenient but complected) extensions that pack complex state, heavy framework lifecycles, and direct execution dependencies inside the editor process.

To maintain simplicity, we strictly categorize and manage our application components as:
*   **Values**: Immutable facts represented as data structures (e.g. editor coordinates, current git commit hashes, file diagnostics, user taste preferences).
*   **State**: The dynamic value of a system component at a specific point in time (e.g., active socket connection pool, current draft inputs).
*   **Identity**: Logical entities whose states evolve over time as a succession of values (e.g., sessions, active permissions).

---

## 📊 Architectural Feature Set Matrix

Below we contrast CommandCode+'s de-complected architecture with typical heavy editor extensions (like standard Copilot/Kilo Code wrappers).

| Domain | Typical Heavy Extension (Complected) | CommandCode+ Architecture (Decomplected) | Strategic Benefits | Trade-offs |
| :--- | :--- | :--- | :--- | :--- |
| **Visual Rendering** | **Framework-Driven (React/SolidJS)**<br>Local state, component lifecycles, virtual DOM sync. | **"Thin Glass" Vanilla JS**<br>Stateless document rendering, direct DOM projection. | Zero dependency bugs, instant loading, absolute decoupling from React memory leaks. | Manual DOM projection logic and custom regex tokenizers. |
| **Context Extraction** | **Direct Extension Host APIs**<br>Synchronous editor checks blocking LLM generation loops. | **IPC UDS Socket Server**<br>Asynchronous, newline-delimited JSON-RPC over Unix sockets. | CLI runs identically in editor, terminal, or CI/CD pipelines. | Serialization overhead; Unix socket lifecycle management. |
| **Tool Execution** | **Custom bundled Javascript**<br>Executing code inline inside extension processes. | **Model Context Protocol (MCP)**<br>Dynamic runtime resolution via playbooks and standard servers. | Extensible tool set; zero extension binary maintenance. | External MCP servers may require a Node runtime when explicitly enabled. |
| **Security Layer** | **Extension Memento Database**<br>GlobalState locks permissions to a single editor instance. | **Shared Filesystem Database**<br>JSON-serialized permission files in `~/.commandcode/permissions.json`. | Unified security profile across headless runs, terminals, and multiple IDEs. | Directory access rights and filesystem collision handling. |
| **Code Validation** | **Compile-time assertions (`as any`)**<br>Assuming payload structures under TypeScript. | **Strict Runtime Narrowing**<br>Type guard functions validating inputs at boundaries. | Bulletproof communication; prevent runtime JSON parse crashes. | Minor boilerplate code validation blocks. |

---

## 🗺️ System Architecture

The following diagram illustrates how the CLI (`cmd`) communicates with the VS Code extension host and webviews over secure, decoupled boundaries.

```mermaid
graph TD
    subgraph VS Code Extension Host
        A[ChatViewProvider] -->|Webview HTML + Main.js| B[Webview Iframe]
        C[LogOutputChannel] -->|Logger Singleton| D[Centralized Output Panel]
        E[IPC Context Server] -->|Unix Domain Socket| F[UDS Socket Connection]
        G[VS Code Settings API] -->|Reactive Event Loop| H[CLI Path Validator]
    end

    subgraph Headless CLI Runner
        I[Command Code CLI] -->|Query Context Requests| F
        I -->|Read/Write Permissions| J[~/.commandcode/permissions.json]
        I -->|Execute Tools| K[MCP Registries]
    end

    subgraph Webview Context
        B -->|JSON-RPC Events| A
        B -->|Keyboard Scroller / CSS Variables| L[Thin Glass Chat UI]
    end
```

---

## 📦 Core Component Modules Playbook

### 1. Thin Glass Webview View System
*   **Location**: [src/webview/main.ts](file:///Users/moe/Desktop/cmd/src/webview/main.ts), [src/webview/style.css](file:///Users/moe/Desktop/cmd/src/webview/style.css)
*   **Rules**:
    *   **Zero Authoritative State**: Do not store state in JS variables. If state changes, serialize it to `vscode.setState()` and redraw the DOM projection based on events.
    *   **CSS-Driven Panel Routing**: Switch panels (Chat, Sessions, Status, Agents, Loops, MCP) by toggling the `panel-active` class. Reject JS routers.
    *   **Theme Integration**: Bind custom scrollbars to native VS Code CSS variables:
        ```css
        ::-webkit-scrollbar-thumb {
          background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
        }
        ```
    *   **Nested Scroll Containment**: Always add `overscroll-behavior: contain;` on nested log/diff widgets to prevent scroll chaining.
    *   **Keyboard Navigation**: Intercept scrolling keys (`PageUp`/`PageDown`/`Ctrl+Arrows`) inside inputs and routing global events on `BODY` to the active viewport container via `getActiveScrollContainer()`.

### 2. Context Server (Unix Domain Socket)
*   **Location**: [src/context/ipc-server.ts](file:///Users/moe/Desktop/cmd/src/context/ipc-server.ts), [src/context/protocol.ts](file:///Users/moe/Desktop/cmd/src/context/protocol.ts)
*   **Rules**:
    *   **Unix Domain Sockets**: Communication is strictly over Unix sockets (or local named pipes on Windows).
    *   **Data Boundaries**: Enforce strict type guards (`isIpcRequest`, `isIpcMessage`) on all incoming string buffers. Do not use type assertions (`as any`).
    *   **Stateless Connection Lifecycle**: Do not assume sockets persist. Design all queries to be transaction-based.

### 3. Decoupled Permission Gate
*   **Location**: [src/permission/gate.ts](file:///Users/moe/Desktop/cmd/src/permission/gate.ts), [src/permission/store.ts](file:///Users/moe/Desktop/cmd/src/permission/store.ts)
*   **Rules**:
    *   **Shared Filesystem Database**: Read and write configurations to `~/.commandcode/permissions.json`.
    *   **Atomic Operations**: Ensure all updates are atomic (using temporary file swaps) to prevent read/write conflicts between concurrent agents.

### 4. Logging & Diagnostics
*   **Location**: [src/logger.ts](file:///Users/moe/Desktop/cmd/src/logger.ts)
*   **Rules**:
    *   **Centralized Output**: Implement all diagnostics via a singleton `Logger` wrapping VS Code's `LogOutputChannel`.
    *   **No Scattered Output Channels**: Never call `createOutputChannel` inline inside modules. This complects logging lifecycle with code execution and leaks memory.

### 5. Bounded Agent Loops
*   **Location**: [src/agents/loop.ts](file:///Users/moe/Desktop/cmd/src/agents/loop.ts), [src/webview/main.ts](file:///Users/moe/Desktop/cmd/src/webview/main.ts)
*   **Rules**:
    *   **Bounded, Not Infinite**: Every loop must have an iteration limit, retry limit, cancellation path, and explicit terminal states.
    *   **Thin Glass Projection**: The webview only renders loop state (`running`, `completed`, `failed`, `cancelled`, `exhausted`) and iteration summaries; it does not decide loop control.
    *   **Durable Reports**: Persist loop artifacts as JSON under `~/.commandcode/loops/` for later inspection.

### 6. Agent Modes & MCP Discovery
*   **Location**: [src/chat/participant.ts](file:///Users/moe/Desktop/cmd/src/chat/participant.ts), [src/ui/pickers.ts](file:///Users/moe/Desktop/cmd/src/ui/pickers.ts), [src/webview/main.ts](file:///Users/moe/Desktop/cmd/src/webview/main.ts)
*   **Rules**:
    *   **Mode Is Prompt Shaping, Not a New Runtime**: Agent modes (`code`, `plan`, `ask`, `debug`, `review`) should bias prompts and UI, not fork the architecture into separate engines.
    *   **MCP Discovery Is Read-Only by Default**: Surface configured MCP servers from `mcp.json` and built-in extension tooling without automatically mutating workspace config.
    *   **Thin Glass Inspection**: The webview may show MCP server status and mode state, but the extension host remains the authority for configuration writes and command execution.

### 7. Zero Data Retention (ZDR) Privacy Isolation
*   **Location**: [src/config.ts](file:///Users/moe/Desktop/cmd/src/config.ts), [src/cli/spawn.ts](file:///Users/moe/Desktop/cmd/src/cli/spawn.ts)
*   **Rules**:
    *   **Subprocess Environment Boundary**: When `cmd-lite.zeroDataRetention` is true, unconditionally inject `CMD_ZDR="1"` into the child process environment map.
    *   **Stateless Execution**: Suppress all persistent prompt caches and session logs on ZDR sessions, guaranteeing enterprise data privacy without modifying CLI core logic.

### 8. Cross-Platform Binary Resolution (`cmdc`)
*   **Location**: [src/cli/resolve.ts](file:///Users/moe/Desktop/cmd/src/cli/resolve.ts)
*   **Rules**:
    *   **Windows Shell Protection**: On `win32`, the default CLI binary name resolves to `cmdc` (or `cmdc.exe`) rather than `cmd`, preventing collision with Windows' native `cmd.exe`.
    *   **Seamless Fallback**: If a custom path is configured via `cmd-lite.cliPath`, honor it directly; otherwise employ platform-safe defaults.

### 9. Automated Diagnostics Remediator (`/fix`) and UI/UX Designer (`/design`)
*   **Location**: [src/handlers/chatInput.ts](file:///Users/moe/Desktop/cmd/src/handlers/chatInput.ts), [src/chat/participant.ts](file:///Users/moe/Desktop/cmd/src/chat/participant.ts)
*   **Rules**:
    *   **Bounded Diagnostic Aggregation**: `/fix` queries active workspace errors and warnings via `collectDiagnostics()`, filters out build/dependency noise (`node_modules`, `dist`, `.git`), sorts errors before warnings, and caps output at 30 items to prevent context window saturation.
    *   **Thin Glass UI/UX Directive**: `/design` biases agent prompting toward aesthetic excellence, glassmorphism, semantic HTML, and dynamic micro-animations across both chat participants and webviews.

---

## 🛠️ Tooling & Scripts Playbook (Babashka Enforced)

We enforce standard workspace scripts using **Babashka (clojure script)** rather than Python, to match our LISP heritage and Clojure-based codebase.

### 1. Package Manager Enforcement
*   **Path**: [scripts/enforce-package-manager.clj](file:///Users/moe/Desktop/cmd/scripts/enforce-package-manager.clj)
*   **Rules**: All dependency installs must run through `pnpm`. Attempting to install via npm, Yarn, or Bun will trigger preinstall failure warnings.

### 2. Git Hooks Configuration
*   **Path**: [scripts/install-hooks.clj](file:///Users/moe/Desktop/cmd/scripts/install-hooks.clj)
*   **Rules**: Pre-commit hooks run automated unit testing, formatting check, and typescript compilation verification using `pnpm` before allowing commits.

### 3. Pre-flight Publishing Verification
*   **Path**: [scripts/publish.clj](file:///Users/moe/Desktop/cmd/scripts/publish.clj)
*   **Rules**: Validates that the git tree is clean, builds the codebase, runs linter and unit tests, compiles the package, and optionally publishes the same single VSIX package to both VS Code Marketplace and Open VSX Registry, preventing duplicate build variance.

---

## 🔬 Quality Verification Checklist

### 1. Automated Tests
*   Run unit tests inside [src/__tests__/](file:///Users/moe/Desktop/cmd/src/__tests__/) using Vitest:
    ```bash
    pnpm test
    ```
*   Run compilation/types check:
    ```bash
    pnpm typecheck
    ```

### 2. CI/CD Pipeline Verification & Gotchas
*   **Package Manager Compliance**: All pipelines must run strictly through `pnpm` (never `npm` or `yarn`).
*   **Node.js Engine Support**: Running pnpm version 11 in CI/CD requires Node.js `22.x` or higher (due to dependencies on native `node:sqlite`). Using older Node runtimes triggers execution crashes.
*   **Preinstall Check Hook dependencies**: Because package installation runs validation scripts utilizing Babashka, CI runners must install the Babashka toolchain before calling `pnpm install`.
*   **Build Order Alignment**: Automated tests (such as webview regression tests) assert assets generated in compilation (e.g. `dist/webview/style.css`). Always execute `pnpm run build` prior to running the test suite in CI to prevent `ENOENT` crashes.

### 3. Manual Visual Tests
*   Verify focus behaviors: Arrow keys and PageUp/PageDown must scroll the chat window when focused inside inputs and on background panel zones.
*   Verify theme colors: Contrast must adapt dynamically when changing workbench themes.
*   Verify nested scrollbars: Confirm nested scrollbars do not pass scroll events to the outer parent layout when boundary is reached.

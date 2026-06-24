# Architectural Decision Record (ADR) Log: CMD Lite

This document compiles the chronological history of key design choices and architectural decisions made for the **CMD Lite** VS Code extension wrapper. In accordance with Rich Hickey's Simplicity principles, we maintain this unified log of immutable design facts to document changes and prevent regressions.

---

## 🏛️ Chronological Decision Log

### ADR-001: Decoupled CLI Wrapper Core Architecture
*   **Context**: Building a heavy editor extension that embeds LLM orchestration and session management inside the editor process complects state. This locks capabilities to one IDE and creates memory-bloated, unstable plugins.
*   **Decision**: CMD Lite acts strictly as a lightweight, framework-free wrapper ("Thin Glass") around the Command Code (`cmd`) CLI. It relays workspace context (selection, diagnostics, git status) over Unix Domain Sockets (UDS) and projects rendering commands. All agent decisions, models, and session states are managed in the CLI or home directory JSON files.

### ADR-002: Package Manager Standardization (pnpm)
*   **Context**: Duplicate package copies in NPM/Bun waste disk space, and flat `node_modules` structures allow "phantom dependencies" (packages importing undeclared modules), compromising build safety.
*   **Decision**: Standardized the project on **pnpm**. Symlinked content-addressable storage isolates package trees, and strict nested resolution prevents phantom dependency pollution.
*   **Enforcement**: Configured `"packageManager": "pnpm@11.7.0"` in `package.json` and implemented a Babashka preinstall hook (`scripts/enforce-package-manager.clj`) that blocks `npm` or `yarn` installation attempts.

### ADR-003: Universal Scripting via Babashka
*   **Context**: Using multiple scripting runtimes (Python, Bash, Node.js) for git hooks, setup checks, and build tasks creates environment fragmentation and execution variance.
*   **Decision**: Standardized all project tooling and script files to use **Babashka (clojure script)**. It runs on a fast, self-contained Clojure runtime that aligns with our functional design paradigms.

### ADR-004: TUI Parity, Keyboard Proxy, and Asynchronous Handshake (v0.3.0)
*   **Context**: Webview panels suffer from iframe focus bounds and startup lag when querying CLI states synchronously.
*   **Decision**: 
    1.  **Asynchronous Context Loading**: Querying runtime parameters (CLI versions, active models) is handled asynchronously to ensure the webview UI opens instantly without locking the editor host.
    2.  **Keyboard Input Proxy (`Ctrl+G`)**: The webview intercepts `Ctrl+G` and opens a native VS Code Input Box modal to collect multi-line text input, bypassing webview input restrictions.
    3.  **Direct Slash Command Routing**: Unknown slash commands are forwarded directly to the CLI rather than validated inside the extension host, making the extension future-proof.

### ADR-005: Layout-Shift Resilient Scrolling & Containment (v0.5.0)
*   **Context**: Asynchronous DOM updates (like streaming stdout chunks or syntax-highlight layout shifts) trigger browser scroll events that complect auto-scrolling with manual scrolling, causing view jumps.
*   **Decision**:
    1.  **Mutation/Resize Observing**: Decoupled DOM mutations from scroll position checking. We track scroll properties (`wasNearBottom`) inside the scroll listener and programmatically scroll only on height changes captured via `MutationObserver` and capture-phase image `load` listeners.
    2.  **Nested Scroll Chains**: Applied `overscroll-behavior: contain` to code blocks and status logs to prevent scrolling boundary events from bubbling up and jumping the parent chat panel.

### ADR-006: Direction-Aware Scroll Checking & Terminal Cleanup (v0.5.2)
*   **Context**: Absolute threshold checks on height can pause auto-scrolling prematurely during async rendering expansions. Also, starting new sessions without terminating older terminals leaks CLI subprocess loops.
*   **Decision**:
    1.  **Direction-Aware Checks**: Check scroll direction and only pause viewport auto-scroll when the user explicitly scrolls upward (`currentScrollTop < lastScrollTop`).
    2.  **Terminal Garbage Collection**: Synchronously search and dispose of existing terminal windows named `Command Code` before spawning a new interactive session terminal.

### ADR-007: Space-Containing Executable Paths Quoting (v0.5.3)
*   **Context**: When resolved executable paths contain spaces (e.g., `/Users/moe/Library/Application Support/...`), shells split command strings on whitespace, crashing terminal launches with file not found.
*   **Decision**: Always wrap the resolved `cliPath` in double quotes (`"${cliPath}"`) inside shell launch handlers in `src/permission/interactive.ts` and command routing scripts.

### ADR-008: Node-Aware Interactive Terminal Launching (v0.5.4)
*   **Context**: Launching JS/MJS CLI executables directly inside terminal windows crashes with a Chromium trace trap when called from VS Code's Electron-based shell.
*   **Decision**: Detect if the resolved `cliPath` ends with `.js` or `.mjs`. If so, prefix the terminal command execution with `process.execPath` (the editor's active Node binary) to run standard node execution safely.

### ADR-009: Dual-Registry Marketplace Publishing (v0.6.3 / v0.6.4)
*   **Context**: Publishing code directly from developer environments complects releases with local state, lockfile variance, and manual access token exposures.
*   **Decision**: Set up a decoupled two-step publishing architecture:
    1.  **Babashka Pre-flight Check (`scripts/publish.clj`)**: Validates clean git state, TypeScript types, linter, tests, and packages a dry-run `.vsix` file locally.
    2.  **Tag-Triggered CI/CD Release Workflow**: Pushing a tag (`v*`) runs a clean container, compiles and packages the extension exactly *once*, and deploys that **single VSIX artifact** to both the Visual Studio Marketplace and the Open VSX Registry, ensuring binary parity.
    3.  **CI/CD Runtimes Upgrades**: Upgraded Node setups to `22.x` to satisfy `pnpm` 11's requirement for the native `node:sqlite` module, and added Babashka setup to the runner.

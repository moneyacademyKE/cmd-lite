# Architectural Decision Record (ADR) Log: CommandCode+

This document compiles the chronological history of key design choices and architectural decisions made for the **CommandCode+** VS Code extension wrapper. In accordance with Rich Hickey's Simplicity principles, we maintain this unified log of immutable design facts to document changes and prevent regressions.

---

## 🏛️ Chronological Decision Log

### ADR-001: Decoupled CLI Wrapper Core Architecture
*   **Context**: Building a heavy editor extension that embeds LLM orchestration and session management inside the editor process complects state. This locks capabilities to one IDE and creates memory-bloated, unstable plugins.
*   **Decision**: CommandCode+ acts strictly as a lightweight, framework-free wrapper ("Thin Glass") around the Command Code (`cmd`) CLI. It relays workspace context (selection, diagnostics, git status) over Unix Domain Sockets (UDS) and projects rendering commands. All agent decisions, models, and session states are managed in the CLI or home directory JSON files.

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

### ADR-010: Native Binary Precedence for CLI Resolution (v0.5.5)
*   **Context**: Electron-derived editors such as Antigravity can crash when an interactive terminal launches stale package entrypoints like `globalStorage/.../cli/dist/index.mjs` through the editor helper process. This complects the editor runtime with CLI package internals.
*   **Decision**: Treat precompiled `cmd` / `command-code` binaries as canonical. CommandCode+ prefers configured native binaries or PATH binaries and only accepts local update artifacts that contain native executables (`command-code`, `cmd`, or platform `.exe` variants). Stale `dist/index.mjs` package entrypoints are ignored.
*   **Consequence**: CLI updates are simpler and safer, but local registry packages must publish a native executable artifact rather than relying on Node package dependency installation.

### ADR-011: Bounded Agent Loops over Infinite Autonomy (v0.5.6)
*   **Context**: Dogfood scripts such as `loop_infinite.clj` demonstrate high leverage from repeated observe-act-verify cycles, but unbounded loops can run away, repeatedly fail, or mutate more scope than intended.
*   **Decision**: CommandCode+ exposes a bounded loop command that requires a task, verification signal, maximum iteration count, retry limit, cancellation path, and explicit `LOOP_DONE` / `LOOP_CONTINUE` agent markers.
*   **Consequence**: Users get repeatable agent progress without granting indefinite autonomy. Future scheduled loops must preserve the same terminal states and approval boundaries.

### ADR-012: Strict Modularization and <500 LOC Constraint
*   **Context**: Monolithic files like `extension.ts` (which grew to ~1138 LOC) and `webview/main.ts` complect routing, state, and UI presentation, violating "Simple Made Easy" principles and causing logic drift.
*   **Decision**: Enforce a strict `<500 LOC` constraint across all repository files. `extension.ts` was decomposed into specialized handlers (`chatInput.ts`, `webviewActions.ts`, `registration.ts`, `integration.ts`). 
*   **Consequence**: High cohesion, low coupling, and clearer boundaries between IPC lifecycle management and user command handling.

### ADR-013: Zero Data Retention (ZDR) Privacy Protocol
*   **Context**: Enterprises and privacy-conscious users require strict guarantees that conversation context, ASTs, and codebase prompts are never persisted or used for model training.
*   **Decision**: Implement `cmd-lite.zeroDataRetention` setting that injects `CMD_ZDR=1` into subprocess execution environments across all CLI spawns. This decomplects privacy policy enforcement from local extension state.
*   **Consequence**: The underlying CLI daemon suppresses telemetry, prompt logging, and disk-persisted conversation memory while keeping the editor interface stateless.

### ADR-014: Cross-Platform Windows Executable Resolution (`cmdc`)
*   **Context**: On Windows (`win32`), `cmd` unconditionally conflicts with the native Windows system command interpreter `cmd.exe`. Launching `cmd` spawns the Windows shell instead of Command Code.
*   **Decision**: Introduce platform-aware binary resolution in `src/cli/resolve.ts`. If the active platform is `win32`, the default CLI executable name dynamically falls back to `cmdc` (or `cmdc.exe`).
*   **Consequence**: Windows users experience seamless out-of-the-box execution without collision or manual setting configuration, preserving standard `cmd` naming on macOS and Linux.

### ADR-015: First-Class `/design` and `/fix` Workspace Diagnostics Automation
*   **Context**: Developers frequently need either frontend UI/UX elevation or fast compilation diagnostics remediation. Forcing manual prompt boilerplate complects cognitive load.
*   **Decision**: Provide unified `/design` and `/fix` slash commands registered across both the VS Code Chat Participant (`@cmd`) and the Thin Glass Webview. `/fix` automatically queries VS Code diagnostics, filters out build/dependency noise, caps at 30 critical items, and formats structured error locations.
*   **Consequence**: Instant one-click diagnostic resolution and aesthetic refinement with full autocomplete parity.

### ADR-016: Display Rebrand CMD Lite → CommandCode+ (v0.5.7)
*   **Context**: The extension's user-facing brand name "CMD Lite" was being rebranded to "CommandCode+" to better reflect product positioning. The extension's technical identity (`cmd-lite.*` command IDs, view IDs, configuration keys) is deeply wired into the VS Code API surface, user `settings.json` files, and keybinding configurations.
*   **Decision**: Decomplect brand identity from technical identity. Only user-facing display text (displayName, command titles, descriptions, error messages, documentation) was changed. All VS Code API identifiers (`cmd-lite.*`) were preserved. Upstream CLI references (`Command Code`, `.commandcode/`, `commandcode.ai`) were left untouched as they are properties of the upstream product.
*   **Consequence**: Zero breaking changes for existing users. Settings, keybindings, and workspace configs continue to work without migration. The `"name"` field in `package.json` changed from `cmd-lite` to `commandcode-plus` for marketplace identity.

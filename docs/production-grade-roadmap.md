# Roadmap to Production-Grade: CMD Lite VS Code Extension

This document outlines the strategic engineering roadmap to mature the **CMD Lite** extension from a highly functional wrapper to an enterprise-level, production-grade tool. Adhering to Rich Hickey's design philosophies, we focus on **decomplecting lifecycle, security, performance, and cross-platform portability**.

---

## 📊 Gap Analysis: Development Baseline vs. Production-Grade

We analyze the gap between the current developer-oriented architecture and a hardened, production-grade system.

| Dimension | Current State (v0.5.4 Baseline) | Target State (Production-Grade) | Architectural Benefit | Accidental Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **Credential Security** | Auth tokens and session parameters stored in globalState or plaintext filesystem files (`~/.commandcode/session.json`). | **Encrypted OS-level Storage**: Leverage the VS Code `SecretStorage` API (backed by macOS Keychain/Windows Credential Manager) for tokens, keeping local state purely non-sensitive. | Prevents local privilege escalation and credential theft from unauthorized local files reads. | Requires abstraction interfaces to read secrets asynchronously. |
| **Activation & Startup** | Actively binds to `onStartupFinished` (contributing to overall editor startup delay). | **Lazy Event-Driven Activation**: Binds strictly to targeted activation events (e.g., commands triggers `cmd-lite.*` or markdown/clojure editor triggers). | Ensures zero overhead on initial VS Code load, keeping editor memory footprints small. | Requires precise package.json mapping for interactive commands. |
| **IPC Sockets Lifecycle** | UDS sockets spawned dynamically without automatic timeout guards or socket garbage-collection, relying on node garbage collector. | **Hardened Socket Lifecycles**: Strict connection timeout limits, active heartbeat/keep-alive validation, and auto-disposal of idle socket handles. | Eliminates memory leaks and prevents dangling zombie sockets when CLI runs are interrupted. | Adds minor socket check interval overhead. |
| **Error Isolation** | Unhandled process rejections are caught globally, and binary errors print directly to stdout/stderr stream panels. | **Sanitized Graceful Boundaries**: Intercepts binary panic codes, masks internal directory paths and secret tokens from logs, and routes user-actionable tips. | Protects developer confidentiality; prevents log exposure of private project structures. | Requires regex and filter mappings for string streams. |
| **Universal Portability** | Extension host contains minor configuration bindings tightly coupled to the VS Code extension runtime. | **Editor-Agnostic Core**: Isolates core connection logic into a shared, standard MCP Client wrapper compatible with Zed, Cursor, or Claude Desktop. | Enables instant expansion to Zed, Cursor, and Claude Desktop using identical CLI transport streams. | Incurs minor abstraction layers for editor-specific features. |

---

## ⚖️ Complexity vs. Utility Matrix

The proposed production-grade tasks are classified by utility and implementation complexity:

| Milestone / Feature | Utility | Complexity | Classification | Action |
| :--- | :---: | :---: | :---: | :--- |
| **Secure Token Encryption via SecretStorage** | High | Low | Security | **Phase 1 (Critical).** Migrate auth handling to native Keychain. |
| **Lazy Activation Events Optimization** | High | Low | Performance | **Phase 1 (Critical).** Remove broad startup triggers. |
| **IPC Connection Heartbeats & Timeout Guards** | Medium | Medium | Reliability | **Phase 2.** Prevent zombie socket leaks. |
| **Log Sanitizer (Secret Masking)** | High | Low | Security / Observability | **Phase 2.** Mask sensitive tokens in stderr. |
| **Cross-Editor Transport Standard (stdio/SSE)** | Medium | High | Portability | **Phase 3.** Support Zed / Cursor clients natively. |
| **Automatic Visual Regression CI Runner** | High | Medium | Developer Experience | **Phase 3.** Move visual test runs to GitHub Actions. |

---

## 🗺️ Execution Milestones

### Phase 1: Security Hardening & Startup Optimization (Immediate)
*   **Encrypted Storage Integration**:
    *   Migrate authentication tokens from the local configuration files to VS Code's native `ExtensionContext.secrets` (`SecretStorage`).
    *   Expose a secure bridge so that the local CLI (`cmd`) can query the active session token headlessly using a secure verification handshake (authenticated UDS query).
*   **Lazy Activation**:
    *   Deprecate the `"onStartupFinished"` trigger in `package.json`.
    *   Replace it with specific trigger events (e.g. `onCommand:cmd-lite.start`, `onView:cmd-lite.chatView`) so the extension does not boot memory arrays until the user interacts with the UI.

### Phase 2: Lifecycle Resilience & Observability (Medium-Term)
*   **Hardened IPC Server Connection Pool**:
    *   Implement client heartbeats (`ping`/`pong`) over the Unix Domain Sockets to detect dropped CLI connections instantly.
    *   Add a connection garbage collector that disposes of inactive socket handles after a 10-minute idle threshold.
*   **Structured Sanitized Logger**:
    *   Enforce a runtime log filter inside `src/logger.ts` to automatically strip any occurrence of authentication tokens, passwords, or absolute home directory paths before writing to the VS Code Output Channel.
*   **Telemetry & Consent Management**:
    *   Implement user consent checkboxes in configuration settings for optional telemetry collection.
    *   Relay anonymous performance markers (e.g. CLI launch duration, webview load latency) to monitor real-world performance.

### Phase 3: Cross-Editor Portability & CI/CD Automation (Long-Term)
*   **Shared CLI Core Transport**:
    *   Extract the socket and MCP Client logic into a portable, framework-free npm/pnpm package.
    *   Expose standard Server-Sent Events (SSE) and stdio transport channels to allow the CLI agent to interact directly with other editors (Zed, Cursor, Claude Desktop).
*   **Automated visual regression on CI**:
    *   Containerize the visual regression testing pipeline.
    *   Configure a GitHub Actions runner utilizing virtual framebuffers (like Xvfb on Linux or custom macOS CI runners) to automatically execute `bb scripts/dogfood.clj all` on pull requests, ensuring visual UI stability.

---

## 🔬 Production Verification Strategy

### 1. Automated Security Penetration Tests
*   Ensure unit tests attempt to read credentials from plaintext configs and verify they fail.
*   Run vulnerability scan workflows (e.g. `npm audit`, `snyk`) on all third-party dependencies as part of the git pre-commit hook.

### 2. Startup & Performance Benchmark Checks
*   Use VS Code's developer command: `Developer: Startup Performance` to benchmark CMD Lite loading time.
*   Verify that activation time remains **under 50ms** during startup sequences.

---
*Status: Drafted. Approved for Phase 1 planning.*

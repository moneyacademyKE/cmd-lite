# CMD Lite SOTA Gap Analysis (2025/2026)

## 1. Overview
As AI coding extensions evolve into multi-step autonomous agents (Cursor, Cline, Aider), we conducted a thorough Rich Hickey Gap Analysis to identify missing capabilities in the `cmd-lite` wrapper, prioritizing Simplicity over Easiness.

## 2. Feature Set Differences

| Capability | SOTA Tool Examples | CMD Lite (Before) | Difference / Gap |
| :--- | :--- | :--- | :--- |
| **Model Context Protocol (MCP)** | Cline, Roo Code | ❌ | No standard protocol for external tool plugins. |
| **Native VS Code Terminal Execution** | Cline, Aider | ❌ | Cannot run arbitrary shell commands and scrape output inside VS Code UI. |
| **Multi-file Inline Composer** | Cursor | ❌ | Only standard diff provider; lacks unified scratchpad. |
| **Browser / DevTools Inspection** | Cline, Cursor | ❌ | No ability to read live DOM/Console from a running app. |

## 3. Complexity vs. Utility Analysis (Rich Hickey Verdicts)

- **MCP Host in Extension**: **Adopt**. Exposing VS Code APIs via MCP decomplects the existing UDS IPC protocol. The `cmd` CLI can connect to this standard interface without proprietary handshakes. High utility, low essential complexity.
- **Native Terminal Execution**: **Adopt via MCP**. Instead of building custom IPC events for terminal access, expose `vscode_execute_terminal` over the new MCP server.
- **Multi-file Inline Composer**: **Reject**. Highly complected. Cursor achieves this by forking the editor. Doing this via Webviews violates our "Thin Glass" pattern.
- **Browser Inspection**: **Reject from Extension**. The extension should not embed Playwright or Chrome DevTools. The CLI should connect to an external, standard Chrome MCP server instead.

## 4. Implementation Outcome (Rich Hickey Certified)
We successfully integrated `@modelcontextprotocol/sdk` into the extension to host a local UDS MCP Server alongside the legacy Context Server. 
- **Decomplected Design**: The extension remains a "dumb host." It merely exposes `child_process.exec` and VS Code Output Channels to the `cmd` CLI using an open, standard protocol (MCP).
- **Quality & Completeness**: Integrated via Red/Green TDD using Vitest with robust `node:net` transport mocking.

**Recommendation For Future Capabilities**: Any future capability requiring VS Code APIs (e.g., File Search, creating editors, reading logs) MUST be added as an MCP Tool rather than expanding the custom IPC server, adhering to the *Standardized Editor Protocol Pattern*.

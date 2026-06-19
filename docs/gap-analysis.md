# Rich Hickey Gap Analysis: Precompiled CLI TUI vs. CMD Lite Extension Webview

This document presents a comprehensive **Rich Hickey Gap Analysis** comparing the precompiled `cmd` Command Line Interface (CLI) Terminal User Interface (TUI) with the unofficial **CMD Lite VS Code Extension Webview**. This analysis applies the core philosophy of **"Simple Made Easy"** (decomplecting state, separating visual projection from execution, and choosing value over place).

---

## 📊 Feature Comparison: CLI TUI vs. Extension Webview

The following table outlines the feature set and interactive capabilities across the different environments.

| Feature / Capability | Precompiled CLI TUI | Extension Webview (Before v0.1.5) | Extension Webview (After v0.1.5) | Architectural / Rich Hickey Analysis |
| :--- | :---: | :---: | :---: | :--- |
| **Shift+Tab Permission Mode Switch** | ✅ | ❌ | ✅ | **Decomplected Interaction**: Cycles permission mode directly without mouse clicks, keeping user input focused. |
| **Ctrl+T Taste/Learning Toggle** | ✅ | ❌ | ✅ | **Bidirectional Notification**: Toggles `continuousLearning` state, updating the UI checkbox and registering system logs dynamically. |
| **Ctrl+O Toggle Expanded Outputs** | ✅ | ❌ | ✅ | **Structural View Control**: Expands or collapses all reasonings simultaneously, avoiding tedious manual accordion clicking. |
| **Alt+P (Option+P) Switch Model** | ✅ | ❌ | ✅ | **Focus Redirection**: Instantly invokes the editor's native quick-pick model list over IPC without local dropdown state. |
| **Single Esc Interrupt/Cancel** | ✅ | ❌ | ✅ | **Process Lifecycle Control**: Aborts the active query using standard Node `AbortSignal`/`AbortController` bindings. |
| **Double Esc Rewind Checkpoint** | ✅ | ❌ | ✅ | **State Rollback**: Triggers git stash pop commands over UDS sockets to revert unwanted edits safely. |
| **TUI Prompt Help Row** | ✅ | ❌ | ✅ | **Visual Information Parity**: Renders hotkey help and active profile toggle directly at the user input boundary. |
| **o Hypothesizing Spinner & Timer**| ✅ | ❌ | ✅ | **Progress Observability**: Renders a live timer ticking every 250ms with read token metrics to eliminate frozen-state anxiety. |

---

## 🔍 Detailed Feature Differences & Architectural Explanations

### 1. Shift+Tab Permission Mode Cycle
*   **CLI TUI:** Cycle occurs instantaneously within the active shell stdin listener.
*   **Webview:** Intercepted in the textarea's keydown handler. Prevents browser focus-change default behaviors (`e.preventDefault()`), determines the next enum value (`standard` → `auto-accept` → `plan`), and dispatches it.
*   **Benefit:** Preserves fluid keyboard typing loops.
*   **Trade-off:** Blocks standard browser visual focus tab-navigation inside the input pane, though focus is restored upon blur.

### 2. Ctrl+T Continuous Learning
*   **CLI TUI:** Toggles global config parameters instantly.
*   **Webview:** Changes a local state flag `state.continuousLearning`, saves it to VS Code's workspace storage, toggles the visual `TASTE` box, and outputs an inline system-info message block.
*   **Benefit:** Users can verify the state of continuous taste-profiling without looking at terminal panels.
*   **Trade-off:** Introducing local storage state in the webview. We keep it thin by mirroring it to the active CLI socket during execution.

### 3. Ctrl+O Accordion Expand
*   **CLI TUI:** Prints full steps instead of folded outputs.
*   **Webview:** Searches for all `details.step-accordion` DOM nodes and toggles their `open` attribute.
*   **Benefit:** High utility when parsing multiple sequential tool executions.
*   **Trade-off:** Modifying DOM attributes directly can trigger minor layout reflows, which are mitigated by scroll-anchoring observers.

### 4. Alt+P Quick Model Switcher
*   **CLI TUI:** Inline terminal interactive prompt.
*   **Webview:** Triggers the VS Code Quick Pick UI.
*   **Benefit:** Utilizes the editor's superior UI elements rather than attempting to draw custom popup overlays inside a tiny iframe.
*   **Trade-off:** Places control entirely in the editor process, which is decoupled from the webview.

### 5. Process Lifecycle Interrupt (Single Esc)
*   **CLI TUI:** Captures `SIGINT` (Ctrl+C / Esc) and kills child tasks.
*   **Webview:** Translates `Esc` key press to an `interrupt-execution` IPC event when `isExecuting` is active.
*   **Benefit:** User can instantly abort runaway queries or incorrect file generations.
*   **Trade-off:** Must manage standard process teardown defensively to avoid leaving orphaned background commands or locks.

### 6. Session Rewind Checkpoint (Double Esc)
*   **CLI TUI:** Runs rollback script.
*   **Webview:** Captures rapid consecutive `Esc` key down events (<400ms) and posts a `checkpoint-restore` notification.
*   **Benefit:** Visual restoration matches the native CLI restore logic.
*   **Trade-off:** Double Esc might be triggered accidentally by a user tapping Esc out of anxiety. The 400ms threshold minimizes this risk.

---

## ⚖️ Complexity vs. Utility Analysis

Below is a Rich Hickey evaluation mapping utility against technical complexity.

| Interactive Capability | Utility Value | Code Complexity | Architectural Classification | Implementation Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **Process Cancellation** | High | Medium | Process Execution | **Adopt.** Mandatory to prevent CPU/Token consumption runaways. |
| **Keyboard Shortcut Interceptors**| High | Medium | UI Interaction | **Adopt.** Achieves keyboard-first parity, critical for power users. |
| **TUI Prompt Help & Spinner** | High | Low | Visual Observability | **Adopt.** Extremely thin visual decoration with zero heavy libraries. |
| **Double Esc Rewind Hook** | Medium | Low | State Recovery | **Adopt.** Extremely simple trigger leading to standard git recovery. |
| **Autocomplete Local popovers** | High | High | Context Mapping | **Adopted (v0.1.2).** High logic footprint but critical utility. |

---

## 🧠 Actionable Recommendations & Weighted Power Analysis

Based on our weighted analysis of **Power/Utility vs. Complexity vs. Trade-offs**, we implement the following:

1.  **Decouple UI Presentation from IPC Metrics:** Keep the status spinner ticking entirely local to the webview script. The extension host should not emit timer tick messages; doing so creates unnecessary socket thrashing.
2.  **Enforce Standard Node Lifecycle Hooks:** Rather than running custom PID termination bash scripts (which can fail on different OS architectures), use VS Code's process abort tokens and Node's standard `AbortController` signal pipeline.
3.  **Strictly Reject UI Frameworks:** Avoid introducing React or SolidJS for shortcuts or visual updates. Direct Vanilla DOM selectors (`document.getElementById`) prevent bundler bloat, compile overhead, and local state sync bugs.
4.  **TDD Certification:** Maintain the `commands.test.ts` suite to ensure CLI argument generation remains correct and robust.

---

## 🏆 Rich Hickey Certification Checklist

To maintain the highest level of software quality, every modification must pass the following checks:
1.  **Decomplecting:** Does the change introduce shared mutable state? *No, state remains unidirectional.*
2.  **Simplicity:** Does it solve one problem at a time? *Yes, keyboard interceptors, status timer, and process signals are fully decoupled.*
3.  **Data over Place:** Are configurations represented as pure, serializable data? *Yes, permission modes and models are passed as simple strings.*
4.  **Safety:** Are type assertions avoided? *Yes, TypeScript narrowing is used instead of `as any` casting.*

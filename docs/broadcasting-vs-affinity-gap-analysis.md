# Rich Hickey Gap Analysis: Broadcasting vs 1:1 Session Affinity

## Overview
This gap analysis addresses the architecture of inter-process communication (IPC) between the VS Code Webview (Thin Glass UI) and the `cmd` CLI instances. Specifically, we are comparing the current **Broadcasting** model against a strict **1:1 Session Affinity** (exclusive lock) model.

The analysis is conducted through the lens of Rich Hickey's "Simple Made Easy" philosophy, specifically focusing on the concepts of **Identity, State, and Time**.

## Feature Set Differences

| Feature Category | Broadcasting (Current) | 1:1 Session Affinity (Proposed) |
| :--- | :--- | :--- |
| **Message Routing** | Extension loops through all active UDS sockets and blindly pushes Webview events to all of them. | Extension routes Webview events to *one specific* target socket (based on PID, Session ID, or a UI lock flag). |
| **Concurrent Sessions** | If 3 CLI tabs are open, hitting "Execute" in the Webview sends the prompt to all 3 simultaneously. | Hitting "Execute" in the Webview sends the prompt *only* to the CLI instance that holds the active UI lock. |
| **Agent Parallelism** | Background CLI tasks (headless) might accidentally receive UI chat events and crash or branch unpredictably. | Background headless tasks operate in complete isolation; they do not receive Webview UI payloads. |
| **Identity Management** | Conflates the identity of all active CLI processes into a single receiver entity. | Respects distinct process identity over time. |

## Explaining the Differences
1. **Message Routing & Concurrency**: Broadcasting is "easy" to write (just a `for` loop over an array of sockets), but it is not "simple". It heavily tangles the state of multiple unrelated processes. If a user is running a long compilation `cmd` background agent and an interactive `cmd` chat session, broadcasting sends chat messages to the compiler agent.
2. **Identity Management (Hickey Perspective)**: In Rich Hickey's terms, an entity must have a distinct identity that progresses through time via a sequence of states. Broadcasting violates this by treating an array of distinct processes as a single identity, leading to unpredictable, entangled state mutations across boundaries.

## Benefits and Trade-offs

### Broadcasting Events
- **Benefits**: Trivial to implement. Works perfectly fine if the user strictly promises to only ever run one instance of `cmd` at a time.
- **Trade-offs**: Extreme risk of race conditions, duplicate AI token consumption, and cross-contamination if the user opens a second terminal tab or runs the "Parallel Agents" feature. 

### 1:1 Session Affinity
- **Benefits**: Total isolation. Parallel agents can run safely in the background while the UI remains strictly bound to one interactive session. Prevents double-billing of AI tokens from multiple CLI instances reacting to the same UI button click.
- **Trade-offs**: Requires implementing a handshake or lock mechanism. The IPC server must track *which* socket owns the Webview. If the owner socket disconnects, the UI must gracefully handle being detached or acquire a new lock.

## Complexity vs Utility

| Architecture | Complexity (Hickey Scale) | Utility / Reliability | Score |
| :--- | :--- | :--- | :--- |
| **Broadcasting Events** | High (Entangles multiple process states together via hidden side effects) | Low (Breaks immediately under multi-agent parallelism) | Low |
| **1:1 Session Affinity** | Low (Decoupled, distinct identities, predictable state) | High (Supports safe background and parallel tasks) | High |

*Note: While Broadcasting requires less code to write (making it "easier" in the short term), it introduces massive systemic complexity by intertwining the state of distinct temporal processes.*

## Actionable Recommendation

**Weighted Analysis:**
- **Power/New Capabilities**: 1:1 Affinity enables safe multi-agent parallelism and background execution without UI contamination.
- **Speed**: Broadcasting is faster to write, but 1:1 Affinity prevents race conditions that slow down execution due to double-API calls.
- **Complexity**: 1:1 Affinity is significantly simpler architecturally because it respects boundaries and distinct identity.
- **Trade-offs**: The minimal upfront cost of implementing a UI Lock Handshake vastly outweighs the chaotic bug reports that will stem from broadcasting to parallel agents.

**Recommendation: Implement an Exclusive UI Lock (1:1 Affinity)**
We must migrate from Broadcasting to 1:1 Affinity. 
1. **The UI Lock Concept**: Whenever a `cmd` CLI boots up in standard interactive mode (no explicit `--ui` flag required), it automatically sends a specific `CLAIM_UI_LOCK` JSON-RPC request during its handshake. Background or headless modes (`--print`) will skip this step.
2. **Server Enforcement**: The VS Code `IPCServer` grants the lock to that specific `net.Socket`. If another CLI requests the lock, it is denied (or forcibly steals it, depending on UX preference—stealing is usually better so the latest active terminal wins).
3. **Targeted Dispatch**: `broadcastEvent` is renamed to `dispatchToWebviewOwner()`, which only writes `IpcEvent`s to the single socket holding the lock. Other headless sockets only receive background context and diagnostic responses.

## Next Actions for Implementation
If approved, we will:
1. Use Red/Green TDD in Babashka to write a mock test proving UI locks can be claimed and stolen between two mock CLI sockets.
2. Add `CLAIM_UI_LOCK` to `protocol.ts` actions.
3. Refactor `ipc-server.ts` to maintain an `activeUiSocket` reference rather than a blindly broadcasting loop.

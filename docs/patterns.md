# Pattern: Parallel Agents with Immutable Taste

## Problem
In agentic coding workflows, running sequential agents (e.g., one agent to implement, followed by one to test, followed by one to document) is slow. However, running parallel agents traditionally leads to race conditions, conflicting file modifications, and divergent state.

## Context (Rich Hickey Lens)
- **State vs. Identity vs. Value:** The preferences ("taste") and the initial user request are *Values* (immutable). The workspace files represent the *State* (mutable). The project itself is the *Identity*.
- **Complecting:** If multiple agents directly mutate the workspace concurrently, they complect their execution with the shared state.

## Solution
Decomplect agent execution from workspace mutation by introducing an event-sourced or merge-queue boundary.

1. **Immutable Context:** All parallel agents (`Agent-Impl`, `Agent-Test`, `Agent-Doc`) are launched with a snapshot of the current workspace and a read-only reference to the global `taste.md` (preferences).
2. **Isolated Execution:** Agents run as separate, isolated processes. They do not write directly to the primary workspace files while executing.
3. **Merge Queue:** Instead of mutating state, each agent produces a "Proposal" (a patch or a complete file update).
4. **Resolution:** A single coordinator process (or user review step) applies these proposals sequentially or merges them.

## Implementation Guidelines (Babashka/CLI)
When implementing this in `cmd` or similar CLI tools:
- Spawning an agent should be a simple OS process invocation.
- Use standard streams (stdin/stdout) or isolated temp directories for agent output.
- The coordinator should handle the `Red/Green TDD` cycle: if a proposal fails the test suite when merged, the failure is fed back to the specific agent as a new immutable event, rather than letting the agent thrash the live codebase.

## Related Learnings
See `docs/learnings.md` for the Kilo Code gap analysis that inspired the adoption of this pattern over deep editor integration.

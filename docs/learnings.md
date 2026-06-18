# Learnings: Rich Hickey Gap Analysis on Editor Integrations

## Background
We performed a Gap Analysis comparing Command Code (CLI + Thin Extension) with Kilo Code (Heavy Extension with Parallel Agents, Inline Autocomplete, and extensive model support) using Rich Hickey principles.

## Core Learnings

### 1. "Simple" vs "Easy" in Editor Integration
- **Inline Autocomplete is "Easy" but "Complected".** It provides immediate tactical value (easy) but ties the agent directly into the editor's token stream, making it highly dependent on the editor's specific APIs. This bypasses the strategic "taste" loop.
- **CLI Encapsulation is "Simple".** Keeping state and inference logic within a CLI (`cmd`) allows for clear, data-driven boundaries. The editor remains a dumb UI frontend.

### 2. Decomplecting Concurrency (Parallel Agents)
Kilo Code's standout feature is parallel agents (e.g., executing implementation, testing, and documentation generation concurrently).
- **The Complected Way:** Passing editor state references or shared mutable memory to multiple agents.
- **The Simple Way:** Treat the agent instructions and the "taste" preferences as an immutable event log. Parallel subprocesses read from the same `taste.md` file and propose changes to an isolated merge queue. 
- *Conclusion:* Concurrency is essential complexity, but it can be implemented simply if state is decoupled.

### 3. Accidental Complexity of Infinite Choice
Supporting 500+ models (via OpenRouter) introduces immense accidental complexity. It forces the system to abstract away prompt formatting and token limit nuances, often resulting in lowest-common-denominator prompt engineering. A curated list of top-tier models provides higher reliability.

## Takeaways for Future Roadmap
When evaluating new features to copy from competitors:
1. Does it complect the CLI state with the Editor state? If yes, reject it or find a simple, data-driven boundary.
2. Does it provide essential utility? If yes, how can we implement it immutably (e.g., via file system drops or standard IO)?

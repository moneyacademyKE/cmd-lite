# Commands
- After code changes (not documentation changes), run the relevant pnpm verification commands and get full output (no tail); fix all errors, warnings, and infos before committing. Confidence: 0.95
- `pnpm exec tsc --noEmit` does not run tests. Confidence: 0.90
- Do not run long-lived dev servers unless explicitly needed; prefer `pnpm run build`, `pnpm exec tsc --noEmit`, and targeted `pnpm exec vitest run ...`. Confidence: 0.95
- Only run specific tests if user instructs or scope is clear, using `pnpm exec vitest run <test-file>`. Confidence: 0.90
- Run tests from the package root, not the repo root. Confidence: 0.90
- When writing tests, run them, identify issues in test or implementation, and iterate until fixed. Confidence: 0.90

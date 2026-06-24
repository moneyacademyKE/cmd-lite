# Rich Hickey Gap Analysis: VS Code Marketplace Publishing

This document evaluates the options for publishing the **CMD Lite** extension to the Visual Studio Code Marketplace under the lens of Rich Hickey's design philosophies: decomplecting execution from environment, single source of truth for secrets, and establishing deterministic validation gates.

---

## 📊 Feature Set & Architectural Difference Matrix

We compare three primary strategies for publishing the `cmd-lite` extension:
1. **Ad-hoc Local Publishing** via CLI (`pnpm vsce publish`)
2. **Automated CI/CD-Driven Publishing** via GitHub Actions (triggered by tag/release)
3. **Manual VSIX Web Dashboard Upload** via the VS Marketplace Management Portal

| Dimension | Option 1: Ad-hoc Local CLI | Option 2: Automated CI/CD | Option 3: Manual Portal Upload |
| :--- | :--- | :--- | :--- |
| **Complecting State** | **High.** Couples publishing to the developer's local terminal state, node version, lockfiles, and manual token caching. | **Low (Decomplected).** Runs in a clean, isolated container environment (e.g. `ubuntu-latest`) with deterministic dependency caching. | **Medium.** Couples packaging locally, but isolates token handling and publishing completely to the browser/web session. |
| **Credential/Secret Risk** | **Medium.** Requiring the developer to input or save their Personal Access Token (PAT) locally (`vsce login`). | **Low (Encrypted).** Token stored as an encrypted GitHub Repository Secret (`VSCE_PAT`) injected strictly at runtime. | **Zero Token Storage.** No PAT is ever generated or saved; authorization is handled via the developer's active Azure DevOps browser session. |
| **Verification Gates** | **Manual/Optional.** Developers *should* run typecheck/lint/test, but can bypass them or execute them under stale local states. | **Strict & Enforced.** Publishing fails instantly if typecheck, linter, tests, or visual check tasks fail in the runner. | **Manual.** The VSIX must be compiled and tested locally before dragging and dropping into the marketplace UI. |
| **Multi-Registry Reach** | **Manual Multiplexing.** Requires running separate commands for Open VSX and VS Code Marketplace, managing separate tokens locally. | **Automated Parity.** A single trigger runs both publishing workflows sequentially, exporting the same packaged VSIX artifact to both. | **Double Work.** Requires manual packaging, opening two dashboard browser tabs, and uploading the VSIX file to each portal. |
| **Audit Trail / Logging** | Hidden in local terminal scrollback; hard to trace who published which version and under what conditions. | Full commit-to-release history, complete build logs, and status tags visible to all developers on GitHub. | Only visible as release updates on the Marketplace portal; lacks build-level transparency. |

---

## 🔍 Feature Differences Explained

### 1. Decomplecting Package Validation from the Environment
*   **The Gap**: Running `vsce publish` locally is "easy" (near at hand) but complected because it relies on the state of the local machine. If the developer has modified files uncommitted, or their local `node_modules` is out of sync, a broken or polluted build could be shipped.
*   **The Decomplected Solution**: In Option 2 (CI/CD), the runner checks out a fresh copy of the tag/release commit, runs `pnpm install --frozen-lockfile` (avoiding local state contamination), executes validation steps, compiles, and packages. This ensures the published artifact is a pure, reproducible function of the Git state.

### 2. Secret Lifecycle and Credential Exposure
*   **The Gap**: VS Code's CLI tool `vsce` authenticates using Azure DevOps Personal Access Tokens (PATs). Storing these tokens in local shells or configuration caches exposes them to theft.
*   **The Decomplected Solution**: Storing the PAT as an encrypted repository secret in GitHub removes the token from local developer environments entirely. It is only accessible to the CI runner during the publishing step. Furthermore, with Azure DevOps retiring global PATs, managing this centrally makes rotating tokens straightforward.

### 3. CI/CD Package Manager Enforcements ("Never use npm")
*   **The Gap**: The current `.github/workflows/ci.yml` file contains `npm ci` and `npm run lint`. This violates the repository's strict policy of **"Never use npm"** and triggers crashes because `scripts/enforce-package-manager.clj` blocks non-pnpm execution.
*   **The Decomplected Solution**: We will align the CI environment with our local conventions by setting up a pnpm action (`pnpm/action-setup`) and running `pnpm install --frozen-lockfile`, `pnpm run lint`, and `pnpm test`.

### 4. Single VSIX Artifact Reusability (Dual-Registry Parity)
*   **The Gap**: Multi-registry publishing is often complected by running separate packaging pipelines for each registry (e.g. compiling once for VSCE and rebuilding/compiling again for OVSX). This wastes computational overhead and risks producing mismatching binaries if the build environment shifts between runs.
*   **The Decomplected Solution**: We compile and package the extension exactly *once* into a single versioned `.vsix` file (e.g., `cmd-lite-0.5.4.vsix`). We then feed this exact same artifact path to both `vsce publish -i <file>` and `ovsx publish -i <file>`. This guarantees 100% binary parity across registries.

---

## ⚖️ Complexity vs. Utility Matrix

We weigh the options based on implementation cost, long-term maintenance, and safety benefits:

| Milestone / Feature | Utility | Complexity | Architectural Impact | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **Aligning CI/CD to use `pnpm`** | High | Low | Medium | **Adopted.** Resolves the npm violation and prevents CI failure due to the package manager enforcement hook. |
| **Adding a pre-publish verification script (`scripts/publish.clj`)** | High | Low | Low | **Adopted.** Automates pre-flight checks (clean git, test completion, version alignment) before packaging. |
| **Configuring Automated GitHub Release Workflow (`.github/workflows/release.yml`)** | High | Medium | High | **Adopted.** Establishes an enterprise-grade automated pipeline for publishing on tag pushes. |
| **Adding Open VSX publishing capability (`ovsx`)** | High | Low | Low | **Adopted.** Leverages locked `ovsx` devDependency and VSIX reuse to deploy to non-Microsoft platforms (Cursor/VSCodium). |

---

## 🏆 Actionable Recommendation & Execution Plan

Based on the weighted gap analysis, we recommend a hybrid, progressive approach:

1. **Step 1: Uncomplect CI Workflow**: Refactor `.github/workflows/ci.yml` to use `pnpm` instead of `npm`, ensuring the CI conforms to the project's strict rules and passes verification.
2. **Step 2: Implement Pre-flight Publishing Script**: Write `scripts/publish.clj` in Babashka. It will:
   * Verify the git working directory is clean.
   * Run typechecking (`pnpm run typecheck`), linting (`pnpm run lint`), and tests (`pnpm test`).
   * Compile and build (`pnpm run build`).
   * Perform version validation.
   * Provide a dry-run vsce packaging check.
3. **Step 3: Establish Automated CI/CD Publishing Workflow**: Create `.github/workflows/release.yml` that triggers on tag pushes (`v*`), builds via `pnpm`, packages, and uses the `vsce` CLI to publish to the Marketplace.
4. **Step 4: Guide the User on Credentials**: Document step-by-step instructions on:
   * How to create the publisher account `moneyacademyke` if not already done.
   * How to acquire an Azure DevOps PAT with Marketplace publish scope.
   * How to configure the PAT in GitHub Secrets (`VSCE_PAT`) for automated publishing.
   * How to publish manually using the local pre-flight Babashka script.

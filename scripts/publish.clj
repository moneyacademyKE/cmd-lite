#!/usr/bin/env bb

(ns publish
  (:require [babashka.fs :as fs]
            [babashka.process :as p]
            [clojure.java.shell :refer [sh]]
            [clojure.string :as str]))

(defn exit-with-error [msg]
  (println "\n🚫 ERROR:" msg)
  (System/exit 1))

(defn run-cmd [args msg]
  (println (str "⏳ " msg "..."))
  (let [res (apply sh args)]
    (if (zero? (:exit res))
      (do
        (println (str "✅ " msg " complete."))
        (:out res))
      (do
        (println (:out res))
        (println (:err res))
        (exit-with-error (str msg " failed with exit code " (:exit res)))))))

(defn git-clean? []
  (let [res (sh "git" "status" "--porcelain")]
    (if (zero? (:exit res))
      (str/blank? (str/trim (:out res)))
      (exit-with-error "Failed to check git status."))))

(defn parse-version []
  (try
    (let [package-json (-> (slurp "package.json")
                           (str/replace #"\r?\n" ""))
          version-match (re-find #"\"version\"\s*:\s*\"([^\"]+)\"" package-json)]
      (if version-match
        (second version-match)
        (exit-with-error "Could not parse version from package.json.")))
    (catch Exception e
      (exit-with-error (str "Failed to read package.json: " (.getMessage e))))))

(defn -main [& args]
  (let [dry-run? (some #{"--dry-run" "-d"} args)
        vsce-pat (System/getenv "VSCE_PAT")
        ovsx-pat (System/getenv "OVSX_PAT")
        version (parse-version)
        vsix-file (str "cmd-lite-" version ".vsix")]
    (println "=========================================================")
    (println "🚀 CMD Lite VS Code Extension Publisher Pre-flight Checks")
    (println "=========================================================")

    ;; 1. Check Git Status
    (println "🔍 Checking git status...")
    (if-not (git-clean?)
      (if dry-run?
        (println "⚠️  Git working directory is not clean. Continuing since --dry-run is set.")
        (exit-with-error "Git working directory is not clean. Please commit or stash changes before publishing."))
      (println "✅ Git working directory is clean."))

    ;; 2. Target VSIX Metadata
    (println (str "📦 Target Version: " version))
    (println (str "📦 Target VSIX: " vsix-file))

    ;; 3. Run Build & Quality Gates
    (run-cmd ["pnpm" "run" "build"] "Building extension")
    (run-cmd ["pnpm" "run" "typecheck"] "Running TypeScript checks")
    (run-cmd ["pnpm" "run" "lint"] "Running ESLint linter")
    (run-cmd ["pnpm" "test"] "Running Vitest test suite")

    ;; 4. Run Packaging Check
    (run-cmd ["pnpm" "run" "package"] "Packaging extension to VSIX")

    (println "\n=========================================================")
    (println "🎉 Pre-flight checks passed successfully!")
    (println "=========================================================")

    (cond
      dry-run?
      (do
        (println "✨ Dry run complete. No publishing was executed.")
        (System/exit 0))

      (or (not (str/blank? vsce-pat)) (not (str/blank? ovsx-pat)))
      (do
        (when (not (str/blank? vsce-pat))
          (println "🔑 Found VSCE_PAT. Publishing to VS Code Marketplace...")
          (run-cmd ["pnpm" "exec" "vsce" "publish" "-i" vsix-file "--no-dependencies"] "Publishing to VS Code Marketplace")
          (println "🚀 Successfully published to VS Code Marketplace!"))
        (when (not (str/blank? ovsx-pat))
          (println "🔑 Found OVSX_PAT. Publishing to Open VSX Registry...")
          (run-cmd ["pnpm" "exec" "ovsx" "publish" "-i" vsix-file "--no-dependencies"] "Publishing to Open VSX Registry")
          (println "🚀 Successfully published to Open VSX Registry!")))

      :else
      (do
        (println "📢 To complete publishing:")
        (println "  Option A (CI/CD - Recommended):")
        (println "    1. Push a release tag matching the version:")
        (println (str "       git tag v" version))
        (println "       git push origin --tags")
        (println "    2. GitHub Actions will build, test, and publish automatically.")
        (println "       (Make sure VSCE_PAT and/or OVSX_PAT are set in secrets)")
        (println "")
        (println "  Option B (Local manual publishing):")
        (println "    1. Set the access token environment variables:")
        (println "       export VSCE_PAT=your_azure_devops_pat")
        (println "       export OVSX_PAT=your_open_vsx_token")
        (println "    2. Rerun this script without --dry-run:")
        (println "       pnpm run publish")
        (System/exit 0)))))

(apply -main *command-line-args*)

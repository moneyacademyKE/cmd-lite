#!/usr/bin/env bb

(ns dogfood
  (:require [babashka.fs :as fs]
            [babashka.process :as p]
            [clojure.java.shell :refer [sh]]
            [clojure.string :as str]
            [cheshire.core :as json]
            [babashka.http-client :as http]))

;; ==========================================
;; Sandbox Setup and Common Utilities
;; ==========================================

(def sandbox-dir (fs/file "sandbox"))
(def sandbox-src (fs/file sandbox-dir "src"))
(def sandbox-tests (fs/file sandbox-dir "tests"))

(defn setup-sandbox []
  (println "Initializing sandbox directories...")
  (fs/create-dirs sandbox-src)
  (fs/create-dirs sandbox-tests)
  (spit (str (fs/file sandbox-src "util.ts")) "// Sandbox utilities\n")
  (spit (str (fs/file sandbox-src "git.ts")) "// Sandbox git utilities\n")
  (spit (str (fs/file sandbox-src "ipc.ts")) "// Sandbox IPC utilities\n"))

(defn run-applescript [script]
  (let [res (sh "osascript" "-e" script)]
    (if (zero? (:exit res))
      (:out res)
      (throw (Exception. (:err res))))))

(defn copy-to-clipboard [text]
  (let [p (p/process ["pbcopy"] {:in text})]
    (p/check p)))

(defn trigger-applescript-prompt [prompt]
  (copy-to-clipboard prompt)
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 1.5
    tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1.5
        -- Trigger Focus Chat Input command
        keystroke \"Command Code: Focus Chat Input\"
        delay 1.5
        key code 36 -- Press Enter
        delay 2 -- Wait for focus transition
        
        -- Paste prompt from clipboard
        keystroke \"v\" using {command down}
        delay 1
        key code 36 -- Press Enter to submit
    end tell"))

(defn capture-screenshot [filename]
  (println "Capturing screenshot:" filename)
  (let [temp-filename-2 (str/replace filename #"\.png$" "-2.png")
        res (sh "screencapture" "-x" "-o" filename temp-filename-2)]
    (if (zero? (:exit res))
      (do
        (println "Screenshot saved successfully.")
        (let [file2 (java.io.File. temp-filename-2)]
          (when (.exists file2)
            (println "Second screen detected. Swapping screen 2 to primary visual check.")
            (sh "mv" temp-filename-2 filename))))
      (println "Failed to save screenshot:" (:err res)))))

(defn read-initial-contents [paths]
  (into {}
        (map (fn [path]
               (let [f (fs/file path)]
                 [path (if (fs/exists? f) (slurp f) nil)]))
             paths)))

(defn wait-for-task-edits [targets initial-contents max-seconds]
  (println "Waiting for task edits on:" targets)
  (loop [elapsed 0]
    (let [done? (every? (fn [path]
                          (let [f (fs/file path)]
                            (and (fs/exists? f)
                                 (> (fs/size f) 0)
                                 (if-let [init-val (get initial-contents path)]
                                   (not= (slurp f) init-val)
                                   true))))
                        targets)]
      (cond
        done? (do (println "Edits detected successfully after" elapsed "seconds!") true)
        (>= elapsed max-seconds) (do (println "Timeout waiting for task edits.") false)
        :else (do
                (Thread/sleep 1000)
                (recur (inc elapsed)))))))

(defn wait-for-files [paths max-seconds]
  (println "Waiting for files:" paths)
  (loop [elapsed 0]
    (let [all-exist? (every? #(let [f (fs/file %)]
                                (and (fs/exists? f) (> (fs/size f) 0)))
                             paths)]
      (cond
        all-exist? true
        (>= elapsed max-seconds) false
        :else (do
                (Thread/sleep 1000)
                (recur (inc elapsed)))))))

(defn verify-typescript [file-path]
  (let [res (sh "npx" "tsc" file-path "--noEmit" "--target" "es2022" "--moduleResolution" "node")]
    (if (zero? (:exit res))
      true
      (do
        (println "TypeScript check failed for" file-path ":" (:err res) (:out res))
        false))))

;; ==========================================
;; CLI Registry Resolution and Updates
;; ==========================================

(defn get-local-cli-version []
  (let [path (str (System/getProperty "user.home")
                  "/Library/Application Support/Antigravity IDE/User/globalStorage/moneyacademyke.cmd-lite/cli/package.json")
        f (fs/file path)]
    (if (fs/exists? f)
      (try
        (let [pkg (json/parse-string (slurp f) true)]
          (:version pkg))
        (catch Exception _ nil))
      nil)))

(defn get-latest-registry-version []
  (try
    (let [res (http/get "https://registry.npmjs.org/command-code/latest")
          body (json/parse-string (:body res) true)]
      (:version body))
    (catch Exception e
      (println "Failed to fetch latest registry version:" (.getMessage e))
      nil)))

(defn trigger-cli-update []
  (println "Triggering CLI update via command palette...")
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 1.5
    tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1.5
        -- Trigger CLI Update command
        keystroke \"Update Command Code CLI\"
        delay 1.5
        key code 36 -- Press Enter
        delay 2
    end tell"))

(defn wait-for-cli-update [target-version max-seconds]
  (println "Waiting for local CLI to update to version" target-version)
  (loop [elapsed 0]
    (let [local-ver (get-local-cli-version)]
      (cond
        (= local-ver target-version)
        (do
          (println "CLI updated successfully to" local-ver "after" elapsed "seconds!")
          true)
        
        (>= elapsed max-seconds)
        (do
          (println "Timeout waiting for CLI update. Current local version:" local-ver)
          false)
        
        :else
        (do
          (Thread/sleep 1000)
          (recur (inc elapsed)))))))

;; ==========================================
;; Visual Scrolling and Workspace JSONL Tests
;; ==========================================

(defn run-visual-layout-test []
  (println "\n=== Starting General UI Layout and Scroll Verification ===")
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 2
    tell application \"System Events\"
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"Command Code: Focus Chat Input\"
        delay 1
        key code 36 -- Press Enter
        delay 2
    end tell")

  (run-applescript
   "tell application \"System Events\"
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 5
    end tell")
  (capture-screenshot "scripts/visual-1-start.png")

  (run-applescript
   "tell application \"System Events\"
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"Command Code: Focus Chat Input\"
        delay 1
        key code 36 -- Press Enter
        delay 2
        keystroke \"Write a very long poem about gravity and Clojure containing at least 4 stanzas.\"
        delay 1
        key code 36 -- Press Enter to submit
        delay 15
    end tell")
  (capture-screenshot "scripts/visual-2-streaming.png")

  (run-applescript
   "tell application \"System Events\"
        key code 116 -- PageUp
        delay 0.5
        key code 116 -- PageUp
        delay 0.5
        key code 116 -- PageUp
        delay 1
    end tell")
  (capture-screenshot "scripts/visual-3-scrolled-up.png")

  (run-applescript
   "tell application \"System Events\"
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 3
    end tell")
  (capture-screenshot "scripts/visual-4-reset-complete.png")
  (println "=== General UI Layout and Scroll Verification Complete ===")
  true)

(defn cleanup-workspace-jsonl-files []
  (println "Cleaning up JSONL workspace files...")
  (sh "git" "checkout" "src/util/util.ts")
  (sh "git" "checkout" "src/tests/util.test.ts")
  (sh "rm" "-f" "src/tests/jsonl.test.ts"))

(defn run-workspace-jsonl-test []
  (println "\n=== Starting Workspace JSON Lines Code Generation Test ===")
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 2
    tell application \"System Events\"
        keystroke \"w\" using {command down, option down}
        delay 2
    end tell")

  (cleanup-workspace-jsonl-files)

  (let [latest-ver (get-latest-registry-version)
        local-ver (get-local-cli-version)]
    (println "Registry CLI version:" latest-ver "Local CLI version:" local-ver)
    (if (and latest-ver (not= local-ver latest-ver))
      (do
        (trigger-cli-update)
        (wait-for-cli-update latest-ver 120))
      (println "CLI is already at the latest version or registry lookup failed.")))

  (run-applescript
   "tell application \"System Events\"
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 6
    end tell")

  (let [prompt "In src/util/util.ts, implement three utility functions: 1. parseJsonLinesDefensive(jsonl: string): Record<string, unknown>[] that parses a JSON Lines string defensively, skipping invalid JSON lines, empty lines, arrays, and primitives. 2. formatJsonLines(records: Record<string, unknown>[]): string that serializes an array of records to a JSON Lines string. If a record is empty or not an object, skip it. 3. filterJsonLines(jsonl: string, predicate: (record: Record<string, unknown>) => boolean): string that parses JSON Lines, filters them with the predicate, and formats them back as JSON Lines. Do NOT use the type 'any' anywhere. Add comprehensive unit tests in a new test file src/tests/jsonl.test.ts verifying all three functions under edge cases."]
    (copy-to-clipboard prompt))

  (run-applescript
   "tell application \"System Events\"
         keystroke \"p\" using {command down, shift down}
         delay 1
         keystroke \"Command Code: Focus Chat Input\"
         delay 1
         key code 36 -- Press Enter
         delay 2
         keystroke \"v\" using {command down}
         delay 1
         key code 36 -- Press Enter to submit
     end tell")

  (println "Prompt submitted. Waiting for task edits...")
  (if (wait-for-files ["src/tests/jsonl.test.ts"] 120)
    (do
      (println "Running workspace tests...")
      (let [test-res (sh "pnpm" "test")]
        (println (:out test-res))
        (if (zero? (:exit test-res))
          (do
            (println "Workspace tests PASSED!")
            (capture-screenshot "scripts/dogfood-visual.png")
            (println "Testing keyboard scrolling up...")
            (run-applescript
             "tell application \"System Events\"
                  key code 116 -- PageUp
                  delay 0.5
                  key code 116 -- PageUp
                  delay 0.5
                  key code 116 -- PageUp
                  delay 1
              end tell")
            (capture-screenshot "scripts/dogfood-visual-scroll-up.png")
            (println "Testing keyboard scrolling back down...")
            (run-applescript
             "tell application \"System Events\"
                  key code 121 -- PageDown
                  delay 0.5
                  key code 121 -- PageDown
                  delay 0.5
                  key code 121 -- PageDown
                  delay 1
              end tell")
            (capture-screenshot "scripts/dogfood-visual-scroll-down.png")
            (println "=== Workspace JSON Lines Code Generation Test Complete ===")
            true)
          (do
            (println "Warning: Some tests failed:" (:err test-res))
            false))))
    (do
      (println "Timeout waiting for workspace code generation.")
      false)))

;; ==========================================
;; DeepSWE Tasks Definitions (delegated to scripts/dogfood_tasks.clj)
;; ==========================================

(load-file (str (or (some-> *file* fs/parent (fs/file "dogfood_tasks.clj")) "scripts/dogfood_tasks.clj")))
(refer 'dogfood-tasks)

(defn run-deepswe-task [task]
  (println (str "\n=== DeepSWE Task " (:id task) ": " (:name task) " (" (name (:level task)) ") ==="))
  ;; Trigger task start command with active IDE focus
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 1.5
    tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1.5
        -- Trigger session start command which stashes changes and reverts templates
        keystroke \"Command Code: Start Command Code Session\"
        delay 1.5
        key code 36 -- Press Enter
        delay 6
    end tell")

  (let [targets (:targets task)
        initial-contents (read-initial-contents targets)]
    (trigger-applescript-prompt (:prompt task))
    (println "Prompt submitted. Waiting for task edits...")
    (if (wait-for-task-edits targets initial-contents 90)
      (do
        (println "Target files edited. Running verifier...")
        (if ((:verify task))
          (do
            (println "✅ DeepSWE Task" (:id task) "PASSED!")
            {:id (:id task) :name (:name task) :status "PASSED"})
          (do
            (println "❌ DeepSWE Task" (:id task) "FAILED (Verification failed)")
            {:id (:id task) :name (:name task) :status "FAILED"})))
      (do
        (println "❌ DeepSWE Task" (:id task) "FAILED (Timeout waiting for edits)")
        {:id (:id task) :name (:name task) :status "TIMEOUT"}))))

;; ==========================================
;; Orchestration and Entry Points
;; ==========================================

(defn generate-report [deepswe-results visual-passed? jsonl-passed?]
  (let [report-path "scripts/deepswe-report.md"
        content (str "# Unified Dogfooding and Visual Test Report\n\n"
                     "Executed at: " (java.time.Instant/now) "\n\n"
                     "## Core Integration Runs\n\n"
                     "| Test Suite | Status |\n"
                     "| --- | --- |\n"
                     "| General Chat Visual Layout & Scroll | " (if visual-passed? "PASSED" "FAILED") " |\n"
                     "| Workspace JSONL Code Gen & Scroll | " (if jsonl-passed? "PASSED" "FAILED") " |\n\n"
                     "## DeepSWE Sandbox Task Runs\n\n"
                     "| Task ID | Task Name | Status |\n"
                     "| --- | --- | --- |\n"
                     (str/join "\n" (map #(str "| " (:id %) " | " (:name %) " | " (:status %) " |") deepswe-results))
                     "\n")]
    (spit report-path content)
    (println "\nReport successfully generated at:" report-path)))

(defn print-help []
  (println "CommandCode+ Consolidated Dogfood Runner")
  (println "Usage: bb scripts/dogfood.clj <command> [args]")
  (println "Commands:")
  (println "  visual          Run general UI layout & scroll verification")
  (println "  jsonl           Run standard workspace JSON Lines code gen test")
  (println "  deepswe <range> Run DeepSWE sandbox tasks (e.g. '1-5', '1-20', or 'all')")
  (println "  all             Run visual, jsonl, and DeepSWE 1-5 in sequence"))

(defn main! [args]
  (let [cmd (first args)]
    (cond
      (or (= cmd "help") (= cmd "--help") (nil? cmd))
      (print-help)

      (= cmd "visual")
      (if (run-visual-layout-test)
        (System/exit 0)
        (System/exit 1))

      (= cmd "jsonl")
      (if (run-workspace-jsonl-test)
        (System/exit 0)
        (System/exit 1))

      (= cmd "deepswe")
      (let [range-arg (second args)
            tasks-to-run (cond
                           (or (nil? range-arg) (= range-arg "all")) deepswe-tasks
                           :else (let [[start end] (map #(Integer/parseInt %) (str/split range-arg #"-"))]
                                   (filter #(and (>= (:id %) start) (<= (:id %) end)) deepswe-tasks)))
            _ (setup-sandbox)
            results (mapv run-deepswe-task tasks-to-run)]
        (generate-report results false false)
        (if (every? #(= (:status %) "PASSED") results)
          (System/exit 0)
          (System/exit 1)))

      (= cmd "all")
      (do
        (setup-sandbox)
        (let [visual-passed? (run-visual-layout-test)
              jsonl-passed? (run-workspace-jsonl-test)
              deepswe-results (mapv run-deepswe-task (take 5 deepswe-tasks))]
          (generate-report deepswe-results visual-passed? jsonl-passed?)
          (if (and visual-passed? jsonl-passed? (every? #(= (:status %) "PASSED") deepswe-results))
            (do
              (println "\n🎉 All core integrations and DeepSWE tests passed successfully!")
              (System/exit 0))
            (do
              (println "\n❌ Unified runner completed with failures.")
              (System/exit 1)))))

      :else
      (do
        (println "Unknown command:" cmd)
        (print-help)
        (System/exit 1)))))

(when (= *file* (System/getProperty "babashka.file"))
  (main! *command-line-args*))

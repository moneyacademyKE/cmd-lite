#!/usr/bin/env bb

(ns deepswe-runner
  (:require [babashka.fs :as fs]
            [babashka.process :as p]
            [clojure.java.shell :refer [sh]]
            [clojure.string :as str]
            [cheshire.core :as json]))

;; Define sandbox directories
(def sandbox-dir (fs/file "sandbox"))
(def sandbox-src (fs/file sandbox-dir "src"))
(def sandbox-tests (fs/file sandbox-dir "tests"))

(defn setup-sandbox []
  (println "Initializing sandbox directories...")
  (fs/create-dirs sandbox-src)
  (fs/create-dirs sandbox-tests)
  ;; Write dummy initial files for tasks to modify
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

;; Verification helpers
(defn verify-typescript [file-path]
  (let [res (sh "npx" "tsc" file-path "--noEmit" "--target" "es2022" "--moduleResolution" "node")]
    (if (zero? (:exit res))
      true
      (do
        (println "TypeScript check failed for" file-path ":" (:err res) (:out res))
        false))))

;; Declare all 20 DeepSWE dogfooding tasks
(def tasks
  [{:id 1
    :name "Grapheme truncation fix"
    :level :low
    :prompt "In sandbox/src/util.ts, implement truncateString(str: string, maxLength: number): string. It must correctly truncate strings by grapheme clusters using Intl.Segmenter, and handle multi-line strings, throwing an error if maxLength is negative."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 2
    :name "Path sanitization utility"
    :level :low
    :prompt "In sandbox/src/util.ts, implement sanitizePath(p: string): string. It should replace duplicate path separators, trim trailing slashes (except root), and handle both Windows backslashes and POSIX forward slashes."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 3
    :name "Format JSON Lines defensive check"
    :level :low
    :prompt "In sandbox/src/util.ts, implement formatJsonLinesDefensive(records: unknown[]): string. It should convert an array of records to a JSON Lines string, filtering out circular references or primitive values defensively."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 4
    :name "Workspace recursive lister"
    :level :low
    :prompt "In sandbox/src/util.ts, implement listFilesRecursive(dir: string): { path: string; size: number }[]. It should traverse the directories recursively and return file information, ignoring the .git directory."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 5
    :name "Git clean state checker"
    :level :low
    :prompt "In sandbox/src/git.ts, implement isWorkspaceGitClean(cwd: string): Promise<boolean>. It should run 'git status --porcelain' using child_process exec and return true if stdout is empty."
    :targets ["sandbox/src/git.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/git.ts"))}

   {:id 6
    :name "Workspace root fallback resolution"
    :level :medium
    :prompt "In sandbox/src/util.ts, implement resolveWorkspaceRoot(folders: { uri: { fsPath: string } }[] | undefined): string. It should return the first folder path, or fallback to os.homedir() if the workspace lists are undefined or empty."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 7
    :name "Diagnostics workspace filtering"
    :level :medium
    :prompt "In sandbox/src/util.ts, implement filterDiagnostics(diagnostics: { source: string; severity: number; file: string }[], workspacePath: string): typeof diagnostics. It should filter diagnostics, returning only errors/warnings belonging to the active workspace path."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 8
    :name "Caching active settings manager"
    :level :medium
    :prompt "In sandbox/src/util.ts, implement class SettingsCache { private store = new Map<string, string>(); get(k: string): string | undefined; set(k: string, v: string): void; load(json: string): void; }. It should load settings from a JSON payload and cache them."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 9
    :name "ANSI escape style stripper"
    :level :medium
    :prompt "In sandbox/src/util.ts, implement stripAnsiEscapes(text: string): string. It must strip all ANSI color, cursor movement, and style escape sequences from stdout logs using regular expressions."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 10
    :name "Taste markdown validation watcher"
    :level :medium
    :prompt "In sandbox/src/util.ts, implement validateTasteMarkdown(mdContent: string): boolean. It should check if the taste file contains a header and returns true if it parses as valid markdown structure."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 11
    :name "IPC server handshake timeout"
    :level :high
    :prompt "In sandbox/src/ipc.ts, implement handleSocketHandshake(socket: any, timeoutMs: number): Promise<boolean>. It should resolve true if the client sends a valid authorization token within the timeout window, or close the socket on timeout."
    :targets ["sandbox/src/ipc.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/ipc.ts"))}

   {:id 12
    :name "Parallel proposal conflict resolver"
    :level :high
    :prompt "In sandbox/src/util.ts, implement resolveConflictProposal(original: string, proposal: string): string. It should inspect the proposal for conflict markers (e.g. '<<<<<<<') and fallback to original if conflicts are detected."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 13
    :name "Virtual document diff refresher"
    :level :high
    :prompt "In sandbox/src/util.ts, implement class DiffRefresher { private listeners: (() => void)[] = []; onDidChange(listener: () => void): void; fireChange(): void; }. It should manage list of change listeners for virtual diff editors."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 14
    :name "Process group interrupt handler"
    :level :high
    :prompt "In sandbox/src/util.ts, implement killProcessGroup(pid: number): void. It should use process.kill with negative pid to terminate the entire process group cleanly across POSIX systems."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 15
    :name "Continuous learning state persistent writer"
    :level :high
    :prompt "In sandbox/src/util.ts, implement saveLearningState(configPath: string, enabled: boolean): Promise<void>. It should write the state atomically (write to temp file and rename) to avoid filesystem corruption."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 16
    :name "CLI transaction rollback fallback"
    :level :extreme
    :prompt "In sandbox/src/util.ts, implement rollbackCliDeployment(activeDir: string, oldDir: string): void. If the deployment verify fails, it should check for existence of oldDir, remove activeDir, and restore oldDir synchronously."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 17
    :name "Playwright accessibility auditor"
    :level :extreme
    :prompt "In sandbox/src/util.ts, implement auditA11yTree(snapshot: any): { label: string; role: string; valid: boolean }[]. It should walk a Playwright AXNode tree and verify if interactive roles have non-empty accessibility names."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 18
    :name "IPC UDS connection encryptor"
    :level :extreme
    :prompt "In sandbox/src/ipc.ts, implement encryptPayload(data: string, secret: string): string. It should serialize and encrypt messages using standard AES-GCM encryption with node's crypto library."
    :targets ["sandbox/src/ipc.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/ipc.ts"))}

   {:id 19
    :name "Autonomous diagnostics compiler loop"
    :level :extreme
    :prompt "In sandbox/src/util.ts, implement class CompilerLoop { run(compileFn: () => { errors: string[] }): boolean; }. It should loop up to 3 times, invoking compileFn. If errors exist, log them to a workspace file."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}

   {:id 20
    :name "Safe registry fallback version picker"
    :level :extreme
    :prompt "In sandbox/src/util.ts, implement getFallbackVersion(localVer: string, registryVer: string, history: string[]): string. It should choose the registryVer if compatible, or fallback to the most recent stable local history entry."
    :targets ["sandbox/src/util.ts"]
    :verify (fn [] (verify-typescript "sandbox/src/util.ts"))}])

(defn run-task [task]
  (println (str "\n=== Task " (:id task) ": " (:name task) " (" (name (:level task)) ") ==="))
  ;; Trigger task start command
  (run-applescript
   "tell application \"System Events\"
        -- Restart session for a clean slate
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 4
    end tell")
  
  (trigger-applescript-prompt (:prompt task))
  (println "Prompt submitted. Waiting for task edits...")
  (if (wait-for-files (:targets task) 90)
    (do
      (println "Target files edited. Running verifier...")
      (if ((:verify task))
        (do
          (println "✅ Task" (:id task) "PASSED!")
          {:id (:id task) :name (:name task) :status "PASSED"})
        (do
          (println "❌ Task" (:id task) "FAILED (Verification failed)")
          {:id (:id task) :name (:name task) :status "FAILED"})))
    (do
      (println "❌ Task" (:id task) "FAILED (Timeout waiting for edits)")
      {:id (:id task) :name (:name task) :status "TIMEOUT"})))

(defn generate-report [results]
  (let [report-path "scripts/deepswe-report.md"
        content (str "# DeepSWE Dogfooding Task Execution Report\n\n"
                     "Executed at: " (java.time.Instant/now) "\n\n"
                     "## Summary Table\n\n"
                     "| Task ID | Task Name | Status |\n"
                     "| --- | --- | --- |\n"
                     (str/join "\n" (map #(str "| " (:id %) " | " (:name %) " | " (:status %) " |") results))
                     "\n")]
    (spit report-path content)
    (println "\nReport generated at:" report-path)))

(defn main! [args]
  (setup-sandbox)
  (let [task-arg (first args)
        tasks-to-run (cond
                       (nil? task-arg) (take 5 tasks) ;; run low-level tasks by default to be fast and safe
                       (= task-arg "--all") tasks
                       :else (let [[start end] (map #(Integer/parseInt %) (str/split task-arg #"-"))]
                               (filter #(and (>= (:id %) start) (<= (:id %) end)) tasks)))
        _ (println "Tasks to run:" (map :id tasks-to-run))
        results (mapv run-task tasks-to-run)]
    (generate-report results)
    (let [failed (filter #(not= (:status %) "PASSED") results)]
      (if (empty? failed)
        (do
          (println "\n🎉 All executed DeepSWE tasks passed successfully!")
          (System/exit 0))
        (do
          (println "\n❌ Some DeepSWE tasks failed:" (map :id failed))
          (System/exit 1))))))

(when (= *file* (System/getProperty "babashka.file"))
  (main! *command-line-args*))

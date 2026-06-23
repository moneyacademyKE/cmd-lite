(require '[clojure.java.shell :refer [sh]])
(require '[clojure.string :as str])

(defn run-applescript [script]
  (println "Executing AppleScript block...")
  (let [res (sh "osascript" "-e" script)]
    (if (zero? (:exit res))
      (println "Success:" (:out res))
      (do
        (println "Error:" (:err res))
        (throw (Exception. (:err res)))))))

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

(defn wait-for-files [paths max-seconds]
  (println "Waiting for files to be generated:" paths)
  (loop [elapsed 0]
    (let [all-exist? (every? #(let [f (java.io.File. %)]
                                (and (.exists f) (> (.length f) 0)))
                             paths)]
      (cond
        all-exist? (do (println "Target files generated successfully after" elapsed "seconds!") true)
        (>= elapsed max-seconds) (do (println "Timeout waiting for target files.") false)
        :else (do
                (Thread/sleep 1000)
                (recur (inc elapsed)))))))

(defn cleanup-target-files []
  (println "Cleaning up target files for a fresh dogfooding run...")
  (sh "git" "checkout" "src/util/util.ts")
  (sh "rm" "-rf" "src/tests/"))

(defn run-dogfood []
  (println "=== Starting CMD Lite Visual UI Dogfooding Run ===")

  ;; Step 1: Activate Antigravity IDE and focus it
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 2
    tell application \"System Events\"
        -- Press Cmd+Option+W to close all editors
        keystroke \"w\" using {command down, option down}
        delay 2
    end tell")

  (cleanup-target-files)

  ;; Start/Restart session to clean state
  (run-applescript
   "tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1
        -- Start/Restart session to clean state
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 6 -- Wait for session initialization
    end tell")

  ;; Step 2: Focus the webview chat input via our focus command
  (run-applescript
   "tell application \"System Events\"
         -- Open command palette
         keystroke \"p\" using {command down, shift down}
         delay 1
         -- Trigger Focus Chat Input command
         keystroke \"Command Code: Focus Chat Input\"
         delay 1
         key code 36 -- Press Enter
         delay 2 -- Wait for focus transition
         
         -- Type the coding prompt
         keystroke \"In src/util/util.ts, add a utility function parseJsonLinesDefensive(jsonl: string): Record<string, any>[] that parses a JSON Lines string (lines separated by newlines) defensively. It should skip invalid JSON lines and collect only valid objects. If a line is empty or whitespace-only, skip it. If a parsed object is not a valid JSON record (i.e. it is a primitive or array), it should skip it. Add comprehensive unit tests in a new test file src/tests/jsonl.test.ts.\"
         delay 2
         key code 36 -- Press Enter to submit
     end tell")

  (println "Prompt submitted to chat webview. Waiting for CMD Lite to process the coding task...")
  (wait-for-files ["src/tests/jsonl.test.ts"] 90)

  ;; Step 3: Capture visual verification screenshot
  (capture-screenshot "scripts/dogfood-visual.png")
  (println "=== CMD Lite Visual UI Dogfooding Run Complete ==="))

(run-dogfood)

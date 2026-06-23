#!/usr/bin/env bb

(ns run-all-dogfood
  (:require [babashka.process :as p]))

(defn run-script [script-path]
  (println "\n=========================================")
  (println "🚀 Running:" script-path)
  (println "=========================================")
  (let [res (p/shell {:continue true} "bb" script-path)]
    (if (zero? (:exit res))
      (println "✅ Success:" script-path)
      (do
        (binding [*out* *err*]
          (println "❌ Error: Script" script-path "failed with exit code" (:exit res)))
        (System/exit (:exit res))))))

(defn main! []
  (println "=== Starting All Dogfooding and Visual UI Tests ===")
  (run-script "scripts/visual-test.clj")
  (run-script "scripts/dogfood-visual.clj")
  (println "\n=========================================")
  (println "🎉 All Dogfooding and Visual UI Tests Completed Successfully!")
  (println "========================================="))

(when (= *file* (System/getProperty "babashka.file"))
  (main!))

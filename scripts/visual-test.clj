#!/usr/bin/env bb

(require '[babashka.fs :as fs]
         '[babashka.process :as p])

(let [script-path (str (fs/file (fs/parent *file*) "dogfood.clj"))]
  (let [proc (p/process ["bb" script-path "visual"] {:inherit true})]
    (System/exit (:exit (p/check proc)))))

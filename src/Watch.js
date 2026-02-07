import {Disposer, Notify, Sass, Term, Time} from "@gesslar/toolkit"
import {watch} from "node:fs/promises"
import process from "node:process"

import Muddy from "./Muddy.js"

/**
 * @import {DirectoryObject} from "@gesslar/toolkit"
 * @import {DisposerClass} from "@gesslar/toolkit"
 * @import {FileObject} from "@gesslar/toolkit"
 * @import {Glog} from "@gesslar/toolkit"
 * @import {NotifyClass} from "@gesslar/toolkit"
 */

export default class Watch {
  /** @type {DirectoryObject} */
  #projectDirectory
  /** @type {DirectoryObject} */
  #srcDirectory
  /** @type {FileObject} */
  #mfile
  /** @type {Glog} */
  #glog
  /** @type {NotifyClass} */
  #notify
  /** @type {DisposerClass} */
  #disposer
  // eslint-disable-next-line jsdoc/no-undefined-types
  /** @type {Array<AsyncIterator>} */
  #watchers = new Array()
  /** @type {AbortController} */
  #ac
  /** @type {boolean} */
  #pending = false
  /** @type {boolean} */
  #busy = false

  /**
   * Main execution point.
   *
   * @param {DirectoryObject} projectDirectory - The directory of project.
   * @param {Glog} log - The Glog instance object.
   */
  async run(projectDirectory, log) {
    this.#projectDirectory = projectDirectory
    this.#srcDirectory = projectDirectory.getDirectory("src")
    this.#mfile = this.#projectDirectory.getFile("mfile")
    this.#glog = log
    this.#notify = Notify
    this.#disposer = Disposer

    await new Muddy().run(this.#projectDirectory, this.#glog)

    this.#initialiseInputHandler()
    this.#startWatch()
  }

  async #startWatch() {
    this.#ac = new AbortController()

    const toWatch = [this.#srcDirectory, this.#mfile]

    try {
      for(const w of toWatch) {
        const watcher = watch(w.url, {
          recursive: w.isDirectory ?? false,
          persistent: true,
          signal: this.#ac.signal,
          overflow: "error"
        })

        this.#watchers.push(watcher)

        ;(async() => {
          try {
            for await(const _ of watcher) {
              if(this.#busy) {
                this.#pending = true
                continue
              }

              this.#pending = false
              this.#busy = true

              await Time.after(50)
              await new Muddy().run(this.#projectDirectory, this.#glog)

              this.#busy = false
            }
          } catch(err) {
            if(err.name === "AbortError")
              return

            throw err
          }
        })()
      }
    } catch {}
  }

  /**
   * Initialises the input handler for watch mode.
   * Sets up raw mode input handling for interactive commands.
   *
   * @returns {void}
   */
  async #initialiseInputHandler() {
    Term
      .setCharMode()
      .resume()
      .utf8()
      .hideCursor()

    process.stdin.on("data", async key => {
      try {
        if(key === "q" || key === "\u0003" || key === "\u0004") {   // Ctrl+C
          Term
            .setLineMode()
            .showCursor()
            .pause()
            .write("\nExiting.\n")

          process.exit(0)
        }
      } catch(error) {
        Sass.new("Processing input.", error).report(true)
      }
    })
  }
}

import {Disposer, Sass, Term} from "@gesslar/toolkit"
import chokidar from "chokidar"
import process from "node:process"

import Muddy from "./Muddy.js"

const DEBOUNCE_MS = 250

/**
 * @import {DirectoryObject} from "@gesslar/toolkit"
 * @import {FileObject} from "@gesslar/toolkit"
 * @import {Glog} from "@gesslar/toolkit"
 * @import {FSWatcher} from "chokidar"
 */

export default class Watch {
  /** @type {DirectoryObject} */
  #projectDirectory
  /** @type {DirectoryObject} */
  #srcDirectory
  /** @type {FileObject} */
  #mfile
  /** @type {FileObject} */
  #mfileObject
  /** @type {Glog} */
  #glog
  /** @type {FSWatcher} */
  #watcher
  /** @type {boolean} */
  #pending = false
  /** @type {boolean} */
  #busy = false
  /** @type {ReturnType<typeof setTimeout>|null} */
  #debounceTimer = null

  /**
   * Main execution point.
   *
   * @param {DirectoryObject} projectDirectory - The directory of project.
   * @param {Glog} log - The Glog instance object.
   * @param {FileObject} [mfileObject] - Optional path to an alternate mfile.
   */
  async run(projectDirectory, log, mfileObject) {
    this.#projectDirectory = projectDirectory
    this.#srcDirectory = projectDirectory.getDirectory("src")
    this.#mfile = mfileObject ?? this.#projectDirectory.getFile("mfile")
    this.#mfileObject = mfileObject ?? null
    this.#glog = log

    await new Muddy().run(this.#projectDirectory, this.#glog, this.#mfileObject)

    this.#initialiseInputHandler()
    this.#startWatch()

    process.on("SIGTERM", () => this.#shutdown())
  }

  #startWatch() {
    const toWatch = [this.#srcDirectory.path, this.#mfile.path]

    this.#watcher = chokidar.watch(toWatch, {
      persistent: true,
      ignoreInitial: true
    })

    this.#watcher
      .on("all", () => this.#scheduleRun())
      .on("error", err => {
        this.#glog.error(`Watch error: ${err}\n${err.stack}`)
        this.#shutdown(1)
      })
  }

  /**
   * Tears down watch mode and exits.
   *
   * Restores terminal state via the registered disposers, closes the file
   * watcher (releasing its fs watches), then exits.
   *
   * @param {number} [code] - Process exit code.
   * @returns {Promise<void>}
   */
  async #shutdown(code = 0) {
    try {
      Disposer.dispose()
      await this.#watcher?.close()
    } catch(error) {
      Sass.new("Error during shutdown.", error).report(true)
    }

    process.exit(code)
  }

  #scheduleRun() {
    if(this.#busy) {
      this.#pending = true

      return
    }

    if(this.#debounceTimer)
      clearTimeout(this.#debounceTimer)

    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null
      this.#runMuddy().catch(err => {
        Sass.new("Build error during watch.", err).report(true)
      })
    }, DEBOUNCE_MS)
  }

  async #runMuddy() {
    this.#busy = true

    try {
      do {
        this.#pending = false
        await new Muddy().run(
          this.#projectDirectory, this.#glog, this.#mfileObject
        )
      } while(this.#pending)
    } finally {
      this.#busy = false
    }
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

    Disposer.register(() => {
      Term
        .setLineMode()
        .showCursor()
        .pause()
        .write("\nExiting.\n")
    })

    process.stdin.on("data", async key => {
      try {
        if(key === "q" || key === "\u0003" || key === "\u0004")   // Ctrl+C
          await this.#shutdown()
        else if(key === "r")
          this.#scheduleRun()
      } catch(error) {
        Sass.new("Processing input.", error).report(true)
      }
    })
  }
}

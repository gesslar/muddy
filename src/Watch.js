import {Disposer, Notify, Time} from "@gesslar/toolkit"
import {watch} from "node:fs/promises"

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
}

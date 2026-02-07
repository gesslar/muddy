#! /usr/bin/env node

import c from "@gesslar/colours"
import {Collection, DirectoryObject, Glog, Sass, Term} from "@gesslar/toolkit"
import {Command} from "commander"
import process from "node:process"

import Muddy from "./Muddy.js"
import Watch from "./Watch.js"

const aliasNames  = ["OK", "INFO", "WARN", "ERR"]
const aliasCodes  = ["{<I}{F064}", "{<I}{F023}", "{<I}{F178}", "{<I}{F166}"]
const kindNames   = ["aliases", "keys", "scripts", "timers", "triggers", "other"]
const kindCodes   = ["{<I}{F167}", "{<I}{F135}", "{<I}{F026}", "{<I}{F223}", "{<I}{F204}", "{<I}{F136}"]

const glogColourNames   = ["success", "info", "warn", "error"]
const glogColourCodes   = ["{F035}", "{F033}", "{F208}", "{F032}"]

void (async() => {
  const opts = {}, args = []

  try {
    // Initialize colours aliases
    aliasNames.forEach((e, i) => c.alias.set(e, aliasCodes[i]))
    kindNames.forEach((e, i) => c.alias.set(e, kindCodes[i]))

    // Initialize logging
    const glog = new Glog()
      .withName("MUDDY")
      .withStackTrace()
      .noDisplayName()
      .withColours(await Collection.allocateObject(
        glogColourNames,
        glogColourCodes
      ))
      .withSymbols(await Collection.allocateObject(
        glogColourNames,
        [`•`, `•`, `•`, `•`]
      ))

    const program = new Command("muddy")
      .argument("[directory]", "The project directory containing an 'mfile' file and 'src/' directory.")
      .option("-w, --watch", "Enable watch mode.", false)
      .option("-n, --nerd", "Nerd mode. Advanced error reporting.", false)
      .parse()

    Object.assign(opts, program.opts())
    args.push(...program.args)

    const dirArg = args.join(" ").trim()
    const cwd = new DirectoryObject(dirArg || ".")

    if(!await cwd.exists) {
      glog.error(`No such directory '${dirArg}'.`)
      process.exit(1)
    }

    if(!(await cwd.hasDirectory("src") && await cwd.hasFile("mfile"))) {
      glog.error(`'${cwd.path}' is not a valid muddy project directory.`)
      process.exit(1)
    }

    if(opts.watch) {
      setupAbortHandlers()
      await new Watch().run(cwd, glog)
    } else {
      await new Muddy().run(cwd, glog)
    }
  } catch(error) {
    Sass.from(error, "Starting muddy.").report(opts.nerd ?? false)
  }

  /**
   * Creates handlers for various reasons that the application may crash.
   */
  function setupAbortHandlers() {
    void["SIGINT", "SIGTERM", "SIGHUP"].forEach(signal => {
      process.on(signal, () => {
        Term
          .setLineMode()
          .showCursor()
          .pause()

        process.exit(0)
      })
    })
  }
})()

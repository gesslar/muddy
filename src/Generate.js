import c from "@gesslar/colours"
import {DirectoryObject} from "@gesslar/toolkit"
import {execSync} from "node:child_process"
import path from "node:path"
import readline from "node:readline"

/**
 * @typedef {object} GenerateOptions
 * @property {string} name - Project name
 * @property {string} version - Starting version
 * @property {string} author - Author name
 * @property {string} title - One-line description
 * @property {boolean} scripts - Include example scripts
 * @property {boolean} aliases - Include example aliases
 * @property {boolean} triggers - Include example triggers
 * @property {boolean} keys - Include example keybindings
 * @property {boolean} timers - Include example timers
 * @property {boolean} gitignore - Include .gitignore
 */

class Generate {
  /** @type {readline.Interface} */
  #rl

  /** @type {string[]} */
  #lineBuffer = []

  /** @type {Function|null} */
  #lineResolve = null

  /**
   * Run the interactive project generator.
   *
   * @param {DirectoryObject} cwd - The directory to generate the project in.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @returns {Promise<void>}
   */
  async run(cwd, glog) {
    this.#rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    this.#rl.on("line", line => {
      if(this.#lineResolve) {
        const resolve = this.#lineResolve
        this.#lineResolve = null
        resolve(line)
      } else {
        this.#lineBuffer.push(line)
      }
    })

    try {
      glog.info("Creating new muddy project!")

      console.log()
      console.log(
        `Please provide the following information to generate your`
        + ` project skeleton.`
      )

      console.log(
        `The defaults will be provided in [], if you enter nothing the`
        + ` default will be used.`
      )

      console.log()

      const gitUser = this.#getGitUser()

      const name = await this.#ask(
        `Project name: `
      )

      if(!name) {
        glog.error("Project name is required.")

        return
      }

      const targetDir = new DirectoryObject(
        path.join(cwd.path, name)
      )

      if(await targetDir.exists) {
        glog.error(
          `Directory '${name}' already exists.`
        )

        return
      }

      console.log()
      console.log(`Setting up a project for '${name}'...`)
      console.log()

      const version = await this.#ask(
        `What version will this project start at? [1.0.0]: `
      ) || "1.0.0"

      const author = await this.#ask(
        `What is the author name of this project? [${gitUser}]: `
      ) || gitUser

      const title = await this.#ask(
        `Briefly describe this project: ["${name}" by ${author}]: `
      ) || `"${name}" by ${author}`

      console.log()
      console.log(`For the following questions, answer:`)
      console.log()
      console.log(`  'y' if you want the category setup with an example item`)
      console.log(`  'n' if you do not`)
      console.log()
      console.log(`You can always add them later if you need them.`)
      console.log()

      const scripts = await this.#askYN("Would you like example scripts? [y]: ", true)
      const aliases = await this.#askYN("Would you like example aliases? [n]: ", false)
      const triggers = await this.#askYN("Would you like example triggers? [n]: ", false)
      const keys = await this.#askYN("Would you like example keybindings? [n]: ", false)
      const timers = await this.#askYN("Would you like example timers? [n]: ", false)

      console.log()

      const gitignore = await this.#askYN(
        `Would you like a .gitignore file for muddy generated files? [y]: `,
        true
      )

      console.log()
      console.log("Project definition:")

      glog.table({
        Name: name,
        Version: version,
        Author: author,
        Title: title,
        Scripts: scripts ? "yes" : "no",
        Aliases: aliases ? "yes" : "no",
        Triggers: triggers ? "yes" : "no",
        Keys: keys ? "yes" : "no",
        Timers: timers ? "yes" : "no",
      })

      console.log()

      const confirm = await this.#askYN(
        `Continue to generate this package? y/n [y]: `,
        true
      )

      if(!confirm) {
        glog.info("Generation cancelled.")

        return
      }

      const opts = {
        name, version, author, title,
        scripts, aliases, triggers,
        keys, timers, gitignore,
      }

      console.log()
      await this.#generate(cwd, glog, opts)
      console.log()

      glog.success(
        c`Your project and any generated files can be found`
        + c` in: {info}${cwd.getDirectory(name).path}{/}`
      )
    } finally {
      this.#rl.close()
    }
  }

  /**
   * Generate the project skeleton.
   *
   * @param {DirectoryObject} cwd - Parent directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger.
   * @param {GenerateOptions} opts - Generation options.
   * @returns {Promise<void>}
   */
  async #generate(cwd, glog, opts) {
    const projectDir = cwd.getDirectory(opts.name)
    const srcDir = projectDir.getDirectory("src")
    await srcDir.assureExists({recursive: true})

    // Write mfile
    const mfile = {
      package: opts.name,
      version: opts.version,
      author: opts.author,
      title: opts.title,
      outputFile: true,
    }
    await projectDir.getFile("mfile")
      .write(JSON.stringify(mfile, null, 2) + "\n")

    // Write .gitignore
    if(opts.gitignore) {
      await projectDir.getFile(".gitignore")
        .write("build/\n.output\n")
    }

    // Write README.md
    await projectDir.getFile("README.md")
      .write(this.#readmeTemplate(opts))

    // Generate module types
    if(opts.scripts) {
      await this.#generateScripts(srcDir, glog, opts)
    }

    if(opts.aliases) {
      await this.#generateAliases(srcDir, glog, opts)
    }

    if(opts.triggers) {
      await this.#generateTriggers(
        srcDir, glog, opts
      )
    }

    if(opts.timers) {
      await this.#generateTimers(srcDir, glog, opts)
    }

    if(opts.keys) {
      await this.#generateKeys(srcDir, glog, opts)
    }
  }

  /**
   * Generate example scripts.
   *
   * @param {DirectoryObject} srcDir - The src directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger.
   * @param {GenerateOptions} opts - Generation options.
   * @returns {Promise<void>}
   */
  async #generateScripts(srcDir, glog, opts) {
    const dir = new DirectoryObject(
      path.join(srcDir.path, "scripts", opts.name)
    )
    await dir.assureExists({recursive: true})

    const safeName = this.#luaSafe(opts.name)
    const scriptName = `${safeName}_example_script`

    await dir.getFile("scripts.json").write(
      JSON.stringify([
        {
          name: scriptName,
          eventHandlerList: ["sysInstall"],
        },
      ], null, 2) + "\n"
    )

    await dir.getFile(`${scriptName}.lua`).write(
      `-- define ${scriptName}()`
      + ` for use as an event handler\n`
      + `function ${scriptName}(event, ...)\n`
      + `  echo("Received event "`
      + ` .. event .. " with arguments:\\n")\n`
      + `  display(...)\n`
      + `end\n`
    )

    glog.success(`{scripts}scripts{/} generation completed successfully`)
  }

  /**
   * Generate example aliases.
   *
   * @param {DirectoryObject} srcDir - The src directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger.
   * @param {GenerateOptions} opts - Generation options.
   * @returns {Promise<void>}
   */
  async #generateAliases(srcDir, glog, opts) {
    const dir = new DirectoryObject(
      path.join(srcDir.path, "aliases", opts.name)
    )
    await dir.assureExists({recursive: true})

    await dir.getFile("aliases.json").write(
      JSON.stringify([
        {
          name: opts.name,
          regex: `^${opts.name}$`,
        },
      ], null, 2) + "\n"
    )

    const safeName = this.#luaSafe(opts.name)
    await dir.getFile(`${safeName}.lua`).write(
      `echo([[\n`
      + `  A circus performer named Brian\n`
      + `  Once smiled as he rode on a lion\n`
      + `  They came back from the ride,\n`
      + `  But with Brian inside,\n`
      + `  And the smile on the face`
      + ` of the lion!\n`
      + `]])\n`
    )

    glog.success(c`{aliases}aliases{/} generation completed successfully`)
  }

  /**
   * Generate example triggers.
   *
   * @param {DirectoryObject} srcDir - The src directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger.
   * @param {GenerateOptions} opts - Generation options.
   * @returns {Promise<void>}
   */
  async #generateTriggers(srcDir, glog, opts) {
    const dir = new DirectoryObject(
      path.join(srcDir.path, "triggers", opts.name)
    )
    await dir.assureExists({recursive: true})

    await dir.getFile("triggers.json").write(
      JSON.stringify([
        {
          name: "Rats",
          isFolder: "yes",
          children: [
            {
              name: "Rat in",
              patterns: [
                {pattern: "^With a squeak, an? .*rat darts into the room, looking about wildly.$", type: "regex"},
                {pattern: "^Your eyes are drawn to an? .*rat that darts suddenly into view.$", type: "regex"},
                {pattern: "^An? .*rat wanders into view, nosing about for food.$", type: "regex"},
                {pattern: "^An? .*rat noses its way cautiously out of the shadows.$", type: "regex"},
              ],
              script: "echo('rat entered!')",
            },
            {
              name: "Rat out",
              patterns: [
                {pattern: "^An? .*rat darts into the shadows and disappears.$", type: "regex"},
                {pattern: "^An? .*rat wanders back into its warren where you may not follow.$", type: "regex"},
                {pattern: "^With a flick of its small whiskers, an? .*rat dashes out of view.$", type: "regex"},
              ],
            },
          ],
        },
        {
          name: "Equilibrium",
          highlight: "yes",
          highlightFG: "#00aa7f",
          highlightBG: "#aa00ff",
          patterns: [
            {pattern: "Regained Equilibrium", type: "substring"},
          ],
        },
        {
          name: "Everything green",
          patterns: [
            {pattern: "2,0", type: "color"},
          ],
        },
      ], null, 2) + "\n"
    )

    glog.success(c`{triggers}triggers{/} generation completed successfully`)

    await dir.getFile("Rat_out.lua")
      .write("echo('Rat out!')\n")

    await dir.getFile("Equilibrium.lua").write(
      "cecho('<cyan>Equilibirum has been regained!"
      + "\\n')\n"
    )

    await dir.getFile("Everything_green.lua").write(
      "debugc(\"A green line came in!"
      + " We are tracking that as part"
      + " of project @PKGNAME@\")\n"
    )
  }

  /**
   * Generate example timers.
   *
   * @param {DirectoryObject} srcDir - The src directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger.
   * @param {GenerateOptions} opts - Generation options.
   * @returns {Promise<void>}
   */
  async #generateTimers(srcDir, glog, opts) {
    const dir = new DirectoryObject(
      path.join(srcDir.path, "timers", opts.name)
    )
    await dir.assureExists({recursive: true})

    await dir.getFile("timers.json").write(
      JSON.stringify([
        {
          name: `${opts.name} anti idle`,
          minutes: "15",
        },
      ], null, 2) + "\n"
    )

    const safeName = this.#luaSafe(opts.name)
    const timerLua = `${safeName}_anti_idle`
    await dir.getFile(`${timerLua}.lua`).write(
      `if not hasFocus() then\n`
      + `  send("ql")\n`
      + `end\n`
    )

    glog.success(c`{timers}timers{/} generation completed successfully`)
  }

  /**
   * Generate example keybindings.
   *
   * @param {DirectoryObject} srcDir - The src directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger.
   * @param {GenerateOptions} opts - Generation options.
   * @returns {Promise<void>}
   */
  async #generateKeys(srcDir, glog, opts) {
    const dir = new DirectoryObject(
      path.join(srcDir.path, "keys", opts.name)
    )
    await dir.assureExists({recursive: true})

    await dir.getFile("keys.json").write(
      JSON.stringify([
        {
          name: "Clearscreen",
          keys: "ctrl+shift+alt+c",
        },
      ], null, 2) + "\n"
    )

    await dir.getFile("Clearscreen.lua")
      .write("clearWindow()\n")

    glog.success(c`{keys}keys{/} generation completed successfully`)
  }

  /**
   * Get the git user name, or a fallback.
   *
   * @returns {string}
   */
  #getGitUser() {
    try {
      return execSync(
        "git config user.name",
        {encoding: "utf8"}
      ).trim()
    } catch {
      return "MudletUser"
    }
  }

  /**
   * Prompt the user for input.
   *
   * @param {string} prompt - The prompt text.
   * @returns {Promise<string>}
   */
  async #ask(prompt) {
    process.stdout.write(prompt)

    let answer
    if(this.#lineBuffer.length > 0) {
      answer = this.#lineBuffer.shift()
    } else {
      answer = await new Promise(resolve => {
        this.#lineResolve = resolve
      })
    }

    return answer.trim()
  }

  /**
   * Prompt the user for a yes/no answer.
   *
   * @param {string} prompt - The prompt text.
   * @param {boolean} defaultValue - Default if empty input.
   * @returns {Promise<boolean>}
   */
  async #askYN(prompt, defaultValue) {
    const answer = await this.#ask(prompt)
    if(!answer) {
      return defaultValue
    }

    return answer.toLowerCase().startsWith("y")
  }

  /**
   * Sanitize a name for use as a Lua identifier
   * and filename. Replaces non-word characters with
   * underscores and strips leading digits.
   *
   * @param {string} name - Raw name to sanitize.
   * @returns {string}
   */
  #luaSafe(name) {
    return name
      .replaceAll(/[^\w]/g, "_")
      .replace(/^\d+/, "")
  }

  /**
   * Generate README.md content.
   *
   * @param {GenerateOptions} opts - Generation options.
   * @returns {string}
   */
  #readmeTemplate(opts) {
    return `# ${opts.name}

## ${opts.title}

This is a template project created by muddy. It's meant to give you the basic skeleton to get started.
It is not a complete project, nor does it provide an example of every type of trigger scenario or keybinding corner case. It would make it even more difficult to clear out to make way for your own items.
It **will** properly muddle and create an mpackage, however.
For more detailed information on describing your triggers, scripts, etc in the json files, please see the [muddler wiki](https://github.com/demonnic/muddler/wiki)

This space is where I would normally put the description of my package and what it does/why I made it. But if you have a README format you already like, feel free to ignore all this.

## Installation

It's a good idea to provide installation instructions. I like to include a command they can copy/paste into the Mudlet commandline. Like

\`lua uninstallPackage("packageName") installPackage("https://somedomain.org/path/to/my/package/packageName.mpackage")\`

## Usage

Brief introduction to the overall usage. Then break it down to specifics

### Aliases

* \`alias1 <param1>\`
  * description of what the alias does, and what param1 is if it exists
    * example usage1
    * optional example usage2, etc
* \`alias 2\`
  * and so on, and so forth

### API

* \`functionName(param1, param2)\`
  * Then, do the same thing for any Lua API which you want them to be able to use.
  * This part can be skipped if you have separate API documentation, but keep in mind the README.md file is accessible from the package manager in Mudlet, so this allows you to provide documentation within Mudlet, to a degree.

## Final thoughts, how to contribute, thanks, things like that

I like to put anything which doesn't fit with the above stuff here, at the end. It keeps the documentation like stuff at the top.
`
  }
}

export default Generate

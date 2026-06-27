import c from "@gesslar/colours"
import {DirectoryObject, FileSystem} from "@gesslar/toolkit"

import Lua from "./Lua.js"
import Type from "./Type.js"

/**
 * Handles adding new Mudlet modules (scripts, aliases, triggers, etc.)
 * to an existing muddy project.
 */
export default class Add {
  /**
   * Run the add command.
   *
   * @param {DirectoryObject} cwd - The project directory.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @param {string} type - The singular module type (alias, key, script, timer, trigger).
   * @param {string} [name] - Optional name for the new module.
   * @returns {Promise<void>}
   */
  async run(cwd, glog, type, name) {
    const plural = Type.TO_PLURAL[type]
    if(!plural) {
      glog.error(`Unknown type '${type}'. Valid types: ${Type.SINGLE.join(", ")}`)
      process.exit(1)
    }

    const srcDir = cwd.getDirectory("src")
    if(!await srcDir.exists) {
      glog.error(`No 'src/' directory found in '${cwd.path}'.`)
      process.exit(1)
    }

    const typeDir = srcDir.getDirectory(plural)
    await typeDir.assureExists({recursive: true})

    const jsonFileName = Type.FILES[plural]
    const jsonFile = typeDir.getFile(jsonFileName)

    let entries = []
    if(await jsonFile.exists) {
      entries = await jsonFile.loadData()
    }

    const resolvedName = name || this.#tempName(type, entries)

    // Add is interactive, so reject a name that can't be a portable filename and
    // let the author choose a better one — rather than silently mangling it into
    // a .lua name that no longer resembles what they typed. (Unpack runs
    // unattended and sanitizes instead; there is no human there to prompt.)
    if(!FileSystem.sane(resolvedName)) {
      glog.error(
        `Module name '${resolvedName}' is not a valid filename. Avoid `
        + `characters like / \\ : * ? " < > |, trailing dots or spaces, and `
        + `reserved device names (CON, NUL, ...).`
      )
      process.exit(1)
    }

    if(entries.some(e => e.name === resolvedName)) {
      glog.error(`A ${type} named '${resolvedName}' already exists in ${jsonFile.relativeTo(cwd)}.`)
      process.exit(1)
    }

    // Name the .lua the same way the build looks it up (see Lua.fileName), so it
    // round-trips. The name is already sane, so this only collapses whitespace.
    const luaFile = typeDir.getFile(`${Lua.fileName(resolvedName)}.lua`)
    if(await luaFile.exists) {
      glog.error(
        `A .lua file '${luaFile.relativeTo(cwd)}' already exists`
        + ` (name '${resolvedName}' maps to '${luaFile.name}').`
      )
      process.exit(1)
    }

    const entry = this.#defaultEntry(type, resolvedName)
    entries.push(entry)

    await jsonFile.write(JSON.stringify(entries, null, 2) + "\n")
    glog.success(c`Added {${plural}}${resolvedName}{/} to ${jsonFile.relativeTo(cwd)}`)

    await luaFile.write("")
    glog.success(c`Created {${plural}}${luaFile.relativeTo(cwd)}{/}`)
  }

  /**
   * Generate a temporary name that doesn't conflict with existing entries.
   *
   * @param {string} type - The singular module type.
   * @param {Array<unknown>} entries - Existing entries.
   * @returns {string}
   */
  #tempName(type, entries) {
    const names = new Set(entries.map(e => e.name))
    let i = 1

    while(names.has(`new_${type}_${i}`)) {
      i++
    }

    return `new_${type}_${i}`
  }

  /**
   * Create a default JSON entry for the given type, shaped
   * according to the muddler JSON schemas so users can see
   * all available fields.
   *
   * @param {string} type - The singular module type.
   * @param {string} name - The module name.
   * @returns {object}
   */
  #defaultEntry(type, name) {
    const base = {
      name,
      isActive: "yes",
      isFolder: "no",
    }

    switch(type) {
      case "script":
        return {
          ...base,
          eventHandlerList: [],
        }
      case "alias":
        return {
          ...base,
          regex: "",
          command: "",
        }
      case "trigger":
        return {
          ...base,
          patterns: [
            {pattern: "", type: "substring"},
          ],
          multiline: "no",
          multilineDelta: "0",
          matchall: "no",
          filter: "no",
          fireLength: "0",
          highlight: "no",
          highlightFG: "",
          highlightBG: "",
          soundFile: "",
          command: "",
        }
      case "timer":
        return {
          ...base,
          command: "",
          time: "00:00:00.000",
        }
      case "key":
        return {
          ...base,
          command: "",
          keys: "",
        }
      default:
        return base
    }
  }
}

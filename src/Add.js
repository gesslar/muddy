import c from "@gesslar/colours"
import {DirectoryObject} from "@gesslar/toolkit"

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
    const safeName = resolvedName.replaceAll(/[^\w]/g, "_").replace(/^\d+/, "")

    if(entries.some(e => e.name === resolvedName)) {
      glog.error(`A ${type} named '${resolvedName}' already exists in ${jsonFile.relativeTo(cwd)}.`)
      process.exit(1)
    }

    const entry = this.#defaultEntry(type, resolvedName)
    entries.push(entry)

    await jsonFile.write(JSON.stringify(entries, null, 2) + "\n")
    glog.success(c`Added {${plural}}${resolvedName}{/} to ${jsonFile.relativeTo(cwd)}`)

    const luaFile = typeDir.getFile(`${safeName}.lua`)
    if(!await luaFile.exists) {
      await luaFile.write("")
      glog.success(c`Created {${plural}}${luaFile.relativeTo(cwd)}{/}`)
    }
  }

  /**
   * Generate a temporary name that doesn't conflict with existing entries.
   *
   * @param {string} type - The singular module type.
   * @param {Array<object>} entries - Existing entries.
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

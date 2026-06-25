import c from "@gesslar/colours"
import {DirectoryObject, FileObject, Sass, Util, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create} from "xmlbuilder2"

import Disk from "./Disk.js"
import {
  KEY_CODE_NAMES,
  KEY_MODIFIER_NAMES,
  KEY_UNKNOWN,
} from "./modules/KeyCode.js"
import Mfile from "./modules/Mfile.js"
import {PATTERN_TYPE_NAMES} from "./modules/Trigger.js"
import Type from "./Type.js"

/**
 * Type imports.
 *
 * @import {Glog} from "@gesslar/toolkit"
 */

let /** @type {Glog} */ glog

/**
 * Reads the text of an element parsed by xmlbuilder2's object format. Empty
 * elements (`<foo/>`) parse to `{}`, populated ones to their string content.
 *
 * @param {unknown} value - The parsed element value
 * @returns {string} The element text, or "" when empty
 */
const text = value => typeof value === "string" ? value : ""

/**
 * Normalizes an xmlbuilder2 object-format value into an array. A single child
 * parses to an object, multiple children to an array; this collapses both.
 *
 * @param {unknown} value - The parsed value
 * @returns {Array<unknown>} The value as an array
 */
const arr = value =>
  value === undefined || value === null
    ? []
    : Array.isArray(value) ? value : [value]

/**
 * Reads a Mudlet list container (e.g. `<regexCodeList><string>..</string>`)
 * into an array of strings.
 *
 * @param {unknown} container - The list container element
 * @param {string} tag - The repeated child tag name (e.g. "string")
 * @returns {Array<string>} The list values
 */
const listOf = (container, tag) => arr(container?.[tag]).map(text)

/**
 * Unpacks a Mudlet `.mpackage` back into a muddy project — the inverse of the
 * Muddy package builder.
 *
 * Extracts the archive, parses the MudletPackage XML into per-type module
 * trees, and writes them back out as the `src/<kind>/<kind>.json` + `.lua`
 * layout muddy consumes. Resources, the icon, and package metadata (mfile,
 * README) are reconstructed alongside.
 */
export default class Unpack {
  /** @type {DirectoryObject} */
  #temp
  /** @type {DirectoryObject} */
  #projectDirectory

  /**
   * Unpacks an mpackage into a project directory.
   *
   * @param {FileObject} mpackageFile - The `.mpackage` archive to unpack
   * @param {DirectoryObject} projectDirectory - The target project directory
   * @param {Glog} log - Logger instance for output
   * @param {object} [options] - Unpack options
   * @param {boolean} [options.helper=true] - Emit a MuddyHelper.lua watcher script
   * @param {boolean} [options.readme=false] - Write the package description to README.md instead of mfile
   * @returns {Promise<DirectoryObject>} The populated project directory
   * @throws {Sass} If the archive is missing or cannot be processed
   */
  async run(mpackageFile, projectDirectory, log, options={}) {
    Valid.type(mpackageFile, "FileObject")
    Valid.type(projectDirectory, "DirectoryObject")
    Valid.type(log, "Glog")

    const {helper=true, readme=false} = options

    glog = log
    this.#projectDirectory = projectDirectory

    if(!await mpackageFile.exists)
      throw Sass.new(`No such file ${mpackageFile.url}`)

    const temp = mkdtempSync(path.join(os.tmpdir(), "unmuddy-"))
    this.#temp = new DirectoryObject(temp)

    try {
      glog.info(c`Extracting {<B}${mpackageFile.name}{B>}`)
      new AdmZip(mpackageFile.path).extractAllTo(temp, true)

      const xmlFile = await this.#findXmlFile()
      const srcDirectory = projectDirectory.getDirectory("src")
      await srcDirectory.assureExists({recursive: true})

      await this.#unpackModules(xmlFile, srcDirectory)
      await this.#reconstructResources(xmlFile, srcDirectory)
      const packageName =
        await this.#reconstructMetadata(projectDirectory, readme)

      if(helper)
        await this.#emitHelper(projectDirectory, packageName)

      glog.success(c`Unpacked into {<B}${projectDirectory.path}{B>}`)

      return projectDirectory
    } catch(error) {
      throw Sass.new("Unpacking mpackage.", error)
    } finally {
      await Disk.deleteRecursive(this.#temp, true)
    }
  }

  /**
   * Locates the MudletPackage XML file at the root of the extracted archive.
   *
   * @private
   * @returns {Promise<FileObject>} The XML file
   * @throws {Sass} If no XML file is found
   */
  #findXmlFile = async() => {
    const found = await this.#temp.glob("*.xml")

    if(found.files.length === 0)
      throw Sass.new("No MudletPackage XML found in the archive.")

    return found.files[0]
  }

  /**
   * Parses the MudletPackage XML and writes every module type back into the
   * `src/<kind>/` layout.
   *
   * @private
   * @param {FileObject} xmlFile - The MudletPackage XML file
   * @param {DirectoryObject} srcDirectory - The project `src/` directory
   * @returns {Promise<void>}
   */
  #unpackModules = async(xmlFile, srcDirectory) => {
    glog.info(c`Parsing {other}${xmlFile.name}{/}`)

    const xml = await xmlFile.read()
    const root = create(xml).end({format: "object"}).MudletPackage ?? {}

    for(const kind of Type.PLURAL) {
      const single = Type.TO_SINGLE[kind]
      const pkg = root[Type.PACKAGES[kind]]
      const nodes = this.#childrenOf(pkg, single)

      if(nodes.length === 0)
        continue

      glog.info(c`Unpacking {${kind}}${kind}{/}`)

      const kindDirectory = srcDirectory.getDirectory(kind)
      await this.#writeNodes(single, kind, nodes, kindDirectory)
    }
  }

  /**
   * Collects the child module nodes of a package or group element, tagging
   * each as a leaf or a folder.
   *
   * @private
   * @param {object} node - The parent package/group element
   * @param {string} single - The singular module type (e.g. "script")
   * @returns {Array<{node: object, isFolder: boolean}>} The child nodes
   */
  #childrenOf = (node, single) => {
    if(!node || typeof node !== "object")
      return []

    const leafTag = Util.capitalize(single)
    const groupTag = `${leafTag}Group`

    return [
      ...arr(node[leafTag]).map(n => ({node: n, isFolder: false})),
      ...arr(node[groupTag]).map(n => ({node: n, isFolder: true})),
    ]
  }

  /**
   * Writes a level of module nodes into a directory: leaf modules become JSON
   * entries plus `.lua` files in this directory, folders recurse into
   * subdirectories named after the folder.
   *
   * @private
   * @param {string} single - The singular module type
   * @param {string} kind - The plural module type
   * @param {Array<{node: object, isFolder: boolean}>} nodes - Nodes at this level
   * @param {DirectoryObject} directory - The directory for this level
   * @returns {Promise<void>}
   */
  #writeNodes = async(single, kind, nodes, directory) => {
    const entries = []

    for(const {node, isFolder} of nodes) {
      if(isFolder) {
        const name = text(node.name)
        const childNodes = this.#childrenOf(node, single)

        await this.#writeNodes(
          single, kind, childNodes, directory.getDirectory(name)
        )

        continue
      }

      const definition = this.#reverseDefinition(single, node)
      const script = text(node.script)

      // Always lay down a sibling .lua so every JSON entry has the file muddy
      // reloads by name — an empty script becomes an empty stub, matching what
      // `muddy --add` creates, so the project rebuilds without warnings. Only
      // announce the ones that actually carry content to keep output quiet.
      await directory.assureExists({recursive: true})

      const luaFile = directory.getFile(`${this.#luaName(definition.name)}.lua`)
      await luaFile.write(script)

      if(script)
        glog.success(c`Wrote {${kind}}${luaFile.relativeTo(this.#projectDirectory)}{/}`)

      entries.push(definition)
    }

    if(entries.length === 0)
      return

    await directory.assureExists({recursive: true})

    const jsonFile = directory.getFile(Type.FILES[kind])
    await jsonFile.write(`${JSON.stringify(entries, null, 2)}\n`)
    glog.success(
      c`Wrote {${kind}}${jsonFile.relativeTo(this.#projectDirectory)}{/} `+
      `(${entries.length} item(s))`
    )
  }

  /**
   * Builds a muddler-friendly JSON definition from a parsed leaf module node,
   * reversing the field translation each module type applies when building.
   *
   * The `script` is deliberately omitted — it lives in a sibling `.lua` file
   * that muddy reloads by name.
   *
   * @private
   * @param {string} single - The singular module type
   * @param {object} node - The parsed leaf module node
   * @returns {object} The JSON definition
   */
  #reverseDefinition = (single, node) => {
    const definition = {
      name: text(node.name),
      isActive: node["@isActive"] ?? "yes",
      isFolder: "no",
    }

    switch(single) {
      case "script": {
        const handlers = listOf(node.eventHandlerList, "string")

        if(handlers.length > 0)
          definition.eventHandlerList = handlers

        break
      }

      case "alias": {
        definition.regex = text(node.regex)
        definition.command = text(node.command)

        break
      }

      case "timer": {
        definition.command = text(node.command)
        definition.time = text(node.time) || "00:00:00.000"

        if(node["@isOffsetTimer"] === "yes")
          definition.isOffsetTimer = "yes"

        break
      }

      case "key": {
        const command = text(node.command)

        if(command)
          definition.command = command

        definition.keys = this.#reverseKeys(
          parseInt(text(node.keyCode), 10),
          parseInt(text(node.keyModifier), 10)
        )

        break
      }

      case "trigger":
        this.#reverseTrigger(node, definition)

        break
    }

    return definition
  }

  /**
   * Reverses a parsed Trigger node into muddler-friendly fields, populating the
   * supplied definition in place.
   *
   * @private
   * @param {object} node - The parsed Trigger node
   * @param {object} definition - The definition to populate
   * @returns {void}
   */
  #reverseTrigger = (node, definition) => {
    const codes = listOf(node.regexCodeList, "string")
    const props = listOf(node.regexCodePropertyList, "integer")

    definition.patterns = codes.map((pattern, i) => ({
      pattern,
      type: PATTERN_TYPE_NAMES[parseInt(props[i], 10)] ?? "substring",
    }))

    const command = text(node.mCommand)

    if(command)
      definition.command = command

    if(node["@isMultiline"] === "yes") {
      definition.multiline = "yes"

      const delta = text(node.conditonLineDelta)

      if(delta && delta !== "0")
        definition.multilineDelta = delta
    }

    if(node["@isPerlSlashGOption"] === "yes")
      definition.matchall = "yes"

    if(node["@isFilterTrigger"] === "yes")
      definition.filter = "yes"

    const fireLength = text(node.mStayOpen)

    if(fireLength && fireLength !== "0")
      definition.fireLength = fireLength

    if(node["@isColorizerTrigger"] === "yes") {
      definition.highlight = "yes"
      definition.highlightFG = text(node.mFgColor)
      definition.highlightBG = text(node.mBgColor)
    }

    const soundFile = text(node.mSoundFile)

    if(soundFile)
      definition.soundFile = soundFile
  }

  /**
   * Reconstructs a key chord string (e.g. "Ctrl+Shift+R") from a Qt key code
   * and modifier bitmask — the inverse of Key.js's chord parser.
   *
   * @private
   * @param {number} keyCode - The Qt key code
   * @param {number} keyModifier - The Qt modifier bitmask
   * @returns {string} The chord string, or "" when there is no bound key
   */
  #reverseKeys = (keyCode, keyModifier) => {
    if(!keyCode || keyCode === KEY_UNKNOWN)
      return ""

    const name = KEY_CODE_NAMES.get(keyCode)

    if(!name)
      return ""

    const modifiers = KEY_MODIFIER_NAMES
      .filter(([bit]) => (keyModifier & bit) !== 0)
      .map(([, label]) => label)

    return [...modifiers, name].join("+")
  }

  /**
   * Copies everything in the archive that is not package machinery (the XML,
   * config.lua, and the `.mudlet/` directory) into `src/resources/`, preserving
   * subdirectory structure so it round-trips through a rebuild.
   *
   * @private
   * @param {FileObject} xmlFile - The MudletPackage XML file (excluded)
   * @param {DirectoryObject} srcDirectory - The project `src/` directory
   * @returns {Promise<void>}
   */
  #reconstructResources = async(xmlFile, srcDirectory) => {
    const found = await this.#temp.glob("**/*")
    const resources = found.files.filter(file => {
      const relative = file.relativeTo(this.#temp)

      return file.name !== xmlFile.name
        && relative !== "config.lua"
        && !relative.startsWith(".mudlet/")
    })

    if(resources.length === 0)
      return

    const resourcesDirectory = srcDirectory.getDirectory("resources")

    glog.info(c`Restoring ${resources.length} resource file(s)`)

    for(const file of resources) {
      const relative = file.relativeTo(this.#temp)
      const destination = resourcesDirectory.getFile(relative)
      await destination.parent.assureExists({recursive: true})
      await file.copy(destination.path)
      glog.success(c`Wrote {other}${destination.relativeTo(this.#projectDirectory)}{/}`)
    }
  }

  /**
   * Reconstructs the project `mfile` from the archive's config.lua, mapping each
   * carried field back to its mfile home via {@link Mfile.CONFIG_TO_MFILE}.
   *
   * The build collapses both `mfile.description` and (when that is empty) the
   * project README into a single `description` in config.lua, so the source is
   * unrecoverable from the package. By default the description is restored
   * verbatim into mfile (no guessing). With `readme`, the caller declares it is
   * really docs: it is written to README.md and left out of mfile, so the next
   * build re-sources it from there.
   *
   * @private
   * @param {DirectoryObject} projectDirectory - The target project directory
   * @param {boolean} readme - Write the description to README.md instead of mfile
   * @returns {Promise<string|null>} The reconstructed package name, or null
   */
  #reconstructMetadata = async(projectDirectory, readme) => {
    const configFile = this.#temp.getFile("config.lua")

    if(!await configFile.exists) {
      glog.warn("No config.lua in archive — skipping mfile reconstruction.")

      return null
    }

    const config = this.#parseConfig(await configFile.read())
    const mfile = {}
    const toReadme = readme && Boolean(config.description)

    // Restore each carried field to its mfile home, verbatim. When --readme was
    // requested, the description is diverted to README.md (below) instead.
    for(const [configKey, mfileField] of Mfile.CONFIG_TO_MFILE) {
      if(toReadme && configKey === "description")
        continue

      if(config[configKey] !== undefined && config[configKey] !== "")
        mfile[mfileField] = config[configKey]
    }

    mfile.outputFile = true

    const mfileObject = projectDirectory.getFile("mfile")
    await mfileObject.write(`${JSON.stringify(mfile, null, 2)}\n`)
    glog.success(c`Wrote {other}${mfileObject.relativeTo(projectDirectory)}{/}`)

    if(toReadme) {
      const description = config.description
      const content = description.endsWith("\n") ? description : `${description}\n`
      const readmeFile = projectDirectory.getFile("README.md")
      await readmeFile.write(content)
      glog.success(c`Wrote {other}${readmeFile.relativeTo(projectDirectory)}{/}`)
    }

    return mfile.package ?? null
  }

  /**
   * Emits a ready-to-use `<package>.MuddyHelper.lua` watcher script beside the
   * mfile, from the shipped template. Dropping it into Mudlet hot-reloads this
   * package on every rebuild — no hand-written helper required.
   *
   * @private
   * @param {DirectoryObject} projectDirectory - The target project directory
   * @param {string|null} packageName - The package name to wire the helper to
   * @returns {Promise<void>}
   */
  #emitHelper = async(projectDirectory, packageName) => {
    if(!packageName) {
      glog.warn("No package name — skipping MuddyHelper.lua.")

      return
    }

    // Resolve the shipped template relative to this module (not the caller's
    // cwd). fromCwf() hands back the FileObject for this very file.
    const templateFile = FileObject.fromCwf()
      .parent
      .getDirectory("templates")
      .getFile("MuddyHelper.lua")
    const template = await templateFile.read()

    // A Lua-safe identifier for the global table name: non-word chars to
    // underscores, leading digits stripped (matches Generate's #luaSafe).
    const pkgId = packageName.replaceAll(/[^\w]/g, "_").replace(/^\d+/, "")

    const content = template
      .replaceAll("@PKGNAME@", packageName)
      .replaceAll("@PKGID@", pkgId)
      .replaceAll("@PROJECTPATH@", projectDirectory.path)

    const helperFile = projectDirectory.getFile(`${packageName}.MuddyHelper.lua`)
    await helperFile.write(content)
    glog.success(c`Wrote {other}${helperFile.relativeTo(projectDirectory)}{/}`)
  }

  /**
   * Parses a config.lua file of `key = [[value]]` long-bracket assignments
   * into a plain object.
   *
   * @private
   * @param {string} content - The config.lua content
   * @returns {Record<string, string>} The parsed key/value pairs
   */
  #parseConfig = content => {
    const config = {}
    const pattern = /(\w+)\s*=\s*\[\[([\s\S]*?)\]\]/g

    let match
    while((match = pattern.exec(content)) !== null)
      config[match[1]] = match[2]

    return config
  }

  /**
   * Derives the `.lua` filename muddy expects for a module name — whitespace
   * collapses to underscores, matching the build's script lookup.
   *
   * @private
   * @param {string} name - The module name
   * @returns {string} The sanitized base filename (without extension)
   */
  #luaName = name => name.replaceAll(/\s/g, "_")
}

import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {DirectoryObject, FileObject, Sass, Util, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create} from "xmlbuilder2"

import Disk from "./Disk.js"
import Lua from "./Lua.js"
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
 * Reads a child element's text by tag, falling back into xmlbuilder2's
 * mixed-content `"#"` array.
 *
 * When an element interleaves leaf and group children — e.g. a Mudlet export
 * of a folder that holds both scripts and subfolders — its own scalar fields,
 * `<name>` included, are pushed into `"#"` alongside the children rather than
 * surfacing as direct keys. A plain `node.name` then reads `undefined`, and the
 * folder unpacks to an empty directory name. Look in `"#"` too so the name
 * survives. Mirrors how {@link Unpack.#childrenOf} reads the same form.
 *
 * @param {unknown} node - The parsed element
 * @param {string} key - The child tag to read (e.g. "name")
 * @returns {string} The element text, or "" when absent
 */
const field = (node, key) => {
  if(!node || typeof node !== "object")
    return ""

  if(key in node)
    return text(node[key])

  if(Array.isArray(node["#"])) {
    const hit = node["#"].find(
      entry => entry && typeof entry === "object" && key in entry
    )

    if(hit)
      return text(hit[key])
  }

  return ""
}

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
  /** @type {{ helper: boolean, readme: boolean }} */
  #options

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
   * @throws {Sass} If the archive cannot be processed
   */
  async run(mpackageFile, projectDirectory, log, options={}) {
    Valid.type(mpackageFile, "FileObject")
    Valid.type(projectDirectory, "DirectoryObject")
    Valid.type(log, "Glog")
    Valid.type(options, "Object|Null")

    const {helper=true, readme=false} = options ?? {}

    this.#options = {helper, readme}
    this.#projectDirectory = projectDirectory

    const temp = mkdtempSync(path.join(os.tmpdir(), "unmuddy-"))
    this.#temp = new DirectoryObject(temp)

    glog = log

    const builder = new AB(this)
    const runner = new AR(builder)

    try {
      return await runner.run({mpackageFile})
    } catch(error) {
      throw Sass.new("Executing Muddy unpacking.", error)
    }
  }

  /**
   * Configures the action builder with the processing pipeline steps.
   *
   * @param {AB} builder - Builder instance
   */
  async setup(builder) {
    try {
      builder
        .do("Extract .mpackage", this.#extractMpackage)
        .do("Find config.lua", this.#findConfigLua)
        .do("Get the mpackage name", this.#getMpackageName)
        .do("Find the package XML file", this.#findPackageXml)
        .do("Setup the source directory", this.#setupSourceDirectory)
        .do("Unpack modules", this.#unpackModules)
        .do("Reconstruct resources", this.#reconstructResources)
        .do("Reconstruct mfile", this.#reconstructMetadata)
        .do("Emit helper", ACTIVITY.IF, () => this.#options.helper, this.#emitHelper)
        .do("Announce completion", this.#announceCompletion)
        .done(this.#cleanUp)
    } catch(error) {
      throw Sass.new("Building the action.", error)
    }
  }

  /**
   * Extracts the `.mpackage` archive into the temporary work directory.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {object} The context object
   */
  #extractMpackage = ctx => {
    const {mpackageFile} = ctx

    glog.info(c`Extracting {<B}${mpackageFile.name}{B>}`)
    new AdmZip(mpackageFile.path).extractAllTo(this.#temp.path, true)

    return ctx
  }

  /**
   * Reads the archive's `config.lua` into the context, failing if it is absent.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<object>} Context with `configData` (trimmed file text)
   * @throws {Sass} If no config.lua exists in the archive
   */
  #findConfigLua = async ctx => {
    glog.info(c`Looking for {other}config.lua{/}`)

    const configLua = this.#temp.getFile("config.lua")

    if(!(await configLua.exists))
      throw Sass.new("No 'config.lua' found in .mpackage archive.")

    ctx.configData = (await configLua.read()).trim()

    glog.success(c`Found {other}config.lua{/}`)

    return ctx
  }

  /**
   * Extracts the package name from the `mpackage` field of config.lua.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {object} Context with `packageName`
   * @throws {Sass} If no `mpackage` field is found in config.lua
   */
  #getMpackageName = ctx => {
    glog.info("Extracting package name from config.lua")

    const {configData} = ctx

    // Match either a Lua long string at any bracket level — `[[..]]`, `[=[..]=]`,
    // … — or a quoted string. The build writes every config value through
    // Lua.longString, which escalates the level when the value contains `]]`, so
    // a package name carrying `]]` arrives as `[=[..]=]`; the `\1` backreference
    // pairs the closing delimiter to the opening level. Mirrors #parseConfig.
    const {bracketName, quoteName} =
      /^\s*mpackage\s*=\s*(?:\[(=*)\[(?<bracketName>[\s\S]*?)\]\1\]|(?<quote>['"])(?<quoteName>[\s\S]*?)\k<quote>)$/gm
        .exec(configData)?.groups ?? {}

    if(!bracketName && !quoteName)
      throw Sass.new("No 'mpackage' field found in config.lua")

    ctx.packageName = bracketName || quoteName

    glog.success(c`Package name is {other}${ctx.packageName}{/}`)

    return ctx
  }

  /**
   * Locates the `<packageName>.xml` MudletPackage file in the extracted archive.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<object>} Context with `xmlFile`
   * @throws {Sass} If the named XML file is not found in the archive
   */
  #findPackageXml = async ctx => {
    const {packageName} = ctx
    const fileName = `${packageName}.xml`

    glog.info(c`Looking for {other}${fileName}{/}`)

    const xmlFile = this.#temp.getFile(fileName)
    if(!(await xmlFile.exists))
      throw Sass.new(`No package file ${fileName} found in .mpackage archive`)

    glog.success(c`Found {other}${fileName}{/}`)

    ctx.xmlFile = xmlFile

    return ctx
  }

  /**
   * Creates the project `src/` directory and adds it to the context.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<object>} Context with `srcDirectory`
   */
  #setupSourceDirectory = async ctx => {
    const srcDirectory = this.#projectDirectory.getDirectory("src")
    await srcDirectory.assureExists({recursive: true})

    ctx.srcDirectory = srcDirectory

    glog.success(c`Created {other}${ctx.srcDirectory.path}{/}`)

    return ctx
  }

  /**
   * Parses the MudletPackage XML and writes every module type back into the
   * `src/<kind>/` layout.
   *
   * @private
   * @param {object} ctx - The context object (with `xmlFile` and `srcDirectory`)
   * @returns {Promise<object>} The context object
   */
  #unpackModules = async ctx => {
    const {xmlFile, srcDirectory} = ctx

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

    return ctx
  }

  /**
   * Collects the child module nodes of a package or group element, tagging
   * each as a leaf or a folder.
   *
   * xmlbuilder2's object format collapses siblings to per-tag keys
   * (`{Script: [...], ScriptGroup: [...]}`) only when each tag forms a
   * contiguous run — which is all muddy ever emits. Packages from muddler or a
   * Mudlet export can interleave leaves and folders, and those parse into a
   * mixed-content `"#"` array preserving document order. Handle both, so any
   * package round-trips rather than silently extracting to nothing.
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
    const tag = (entry, isFolder) =>
      arr(entry).map(n => ({node: n, isFolder}))

    // Mixed-content form: each "#" entry is one element, in document order.
    if(Array.isArray(node["#"])) {
      return node["#"].flatMap(entry => [
        ...tag(entry[leafTag], false),
        ...tag(entry[groupTag], true),
      ])
    }

    return [
      ...tag(node[leafTag], false),
      ...tag(node[groupTag], true),
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
        const name = field(node, "name")
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

      const luaFile = directory.getFile(`${Lua.fileName(definition.name)}.lua`)
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
      `(${entries.length} item${entries.length == 1 ? "" : "s"})`
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
   * @param {object} ctx - The context object (with `xmlFile` and `srcDirectory`)
   * @returns {Promise<object>} The context object
   */
  #reconstructResources = async ctx => {
    const {xmlFile, srcDirectory} = ctx
    const found = await this.#temp.glob("**/*")

    // The package XML lives at the archive root, so exclude it by relative path,
    // not basename — otherwise a resource in a subdirectory sharing that
    // filename (e.g. vendor/<Package>.xml) would be wrongly dropped.
    const xmlRelative = xmlFile.relativeTo(this.#temp)
    const resources = found.files.filter(file => {
      const relative = file.relativeTo(this.#temp)

      return relative !== xmlRelative
        && relative !== "config.lua"
        && !relative.startsWith(".mudlet/")
    })

    if(resources.length === 0)
      return ctx

    const resourcesDirectory = srcDirectory.getDirectory("resources")

    glog.info(c`Restoring ${resources.length} resource file(s)`)

    for(const file of resources) {
      const relative = file.relativeTo(this.#temp)
      const destination = resourcesDirectory.getFile(relative)
      await destination.parent.assureExists({recursive: true})
      await file.copy(destination.path)
      glog.success(c`Wrote {other}${destination.relativeTo(this.#projectDirectory)}{/}`)
    }

    return ctx
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
   * @param {object} ctx - The context object (with `configData`)
   * @returns {Promise<object>} The context object
   */
  #reconstructMetadata = async ctx => {
    const {configData} = ctx
    const config = this.#parseConfig(configData)
    const mfile = {}
    const toReadme = this.#options.readme && Boolean(config.description)

    // Restore each carried field to its mfile home, verbatim. When --readme was
    // requested, the description is diverted to README.md (below) instead.
    for(const [configKey, mfileField] of Mfile.CONFIG_TO_MFILE) {
      if(toReadme && configKey === "description")
        continue

      if(config[configKey] !== undefined && config[configKey] !== "")
        mfile[mfileField] = config[configKey]
    }

    mfile.outputFile = true

    const mfileObject = this.#projectDirectory.getFile("mfile")
    await mfileObject.write(`${JSON.stringify(mfile, null, 2)}\n`)
    glog.success(c`Wrote {other}${mfileObject.relativeTo(this.#projectDirectory)}{/}`)

    if(toReadme) {
      const description = config.description
      const content = description.endsWith("\n") ? description : `${description}\n`
      const readmeFile = this.#projectDirectory.getFile("README.md")
      await readmeFile.write(content)
      glog.success(c`Wrote {other}${readmeFile.relativeTo(this.#projectDirectory)}{/}`)
    }

    return ctx
  }

  /**
   * Emits a ready-to-use `<package>.MuddyHelper.lua` watcher script beside the
   * mfile, from the shipped template. Dropping it into Mudlet hot-reloads this
   * package on every rebuild — no hand-written helper required.
   *
   * @private
   * @param {object} ctx - The context object (with `packageName`)
   * @returns {Promise<object>} The context object
   */
  #emitHelper = async ctx => {
    const {packageName} = ctx

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

    // @PKGNAME@ is cosmetic (comments); @PKGID@ is a Lua identifier. The values
    // that land in Lua string positions (@NAME@, @PATH@) go through
    // Lua.longString so any character — including `]]` in a path — embeds safely.
    const content = template
      .replaceAll("@PKGNAME@", packageName)
      .replaceAll("@PKGID@", pkgId)
      .replaceAll("@NAME@", Lua.longString(packageName))
      .replaceAll("@PATH@", Lua.longString(this.#projectDirectory.path))

    const helperFile = this.#projectDirectory.getFile(`${packageName}.MuddyHelper.lua`)
    await helperFile.write(content)

    glog.success(c`Wrote {other}${helperFile.relativeTo(this.#projectDirectory)}{/}`)

    return ctx
  }

  /**
   * Parses a config.lua file of `key = [[value]]` long-bracket assignments
   * into a plain object. Handles any bracket level (`[[…]]`, `[=[…]=]`, …) so a
   * value containing `]]` round-trips — the level captured in group 2 is matched
   * by the backreference in the closing delimiter. Mirrors the build's
   * `#luaLongString`.
   *
   * @private
   * @param {string} content - The config.lua content
   * @returns {Record<string, string>} The parsed key/value pairs
   */
  #parseConfig = content => {
    const config = {}
    const pattern = /(\w+)\s*=\s*\[(=*)\[([\s\S]*?)\]\2\]/g

    let match
    while((match = pattern.exec(content)) !== null)
      config[match[1]] = match[3]

    return config
  }

  /**
   * Announces successful completion and yields the populated project directory
   * as the pipeline's final value.
   *
   * @private
   * @returns {DirectoryObject} The populated project directory
   */
  #announceCompletion = () => {
    glog.success(c`Unpacked into {<B}${this.#projectDirectory.path}{B>}`)

    return this.#projectDirectory
  }

  /**
   * Removes the temporary extraction directory. Runs as the pipeline's `done`
   * finalizer, so it fires even when an earlier step throws.
   *
   * @private
   * @param {unknown} ctx - The final context (or the caught error on failure)
   * @returns {Promise<unknown>} The context, passed through unchanged
   */
  #cleanUp = async ctx => {
    await Disk.deleteRecursive(this.#temp, true)

    return ctx
  }
}

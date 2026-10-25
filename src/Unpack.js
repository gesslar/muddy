import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {DirectoryObject, FileSystem, Sass, Util, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create} from "xmlbuilder2"

import Disk from "./Disk.js"
import Helper from "./Helper.js"
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
 * @import {FileObject, Glog} from "@gesslar/toolkit"
 */

let /** @type {Glog} */ glog

/**
 * Stands in for `&` while xmlbuilder2 parses (see {@link shieldEntities}).
 * A private-use code point, so it can't collide with real markup.
 */
const AMP = "\uE000"

const ENTITIES = Object.freeze({amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"})

/**
 * Hides every entity reference from xmlbuilder2 before parsing.
 *
 * xmlbuilder2 can't hand element text back verbatim. Its reader decodes
 * `&amp;#160;` twice, down to a bare NBSP, and its object format re-escapes
 * `<`, `>` and `&` on the way out. A script full of HTML entities would
 * unpack altered (#88). Swapping each `&` for {@link AMP} leaves the
 * references in the text untouched, and {@link text} decodes them itself, once.
 * Any literal AMP already in the XML is turned into a character reference
 * first, so it survives too.
 *
 * @param {string} xml - The raw package XML
 * @returns {string} The XML with every `&` replaced by {@link AMP}
 */
const shieldEntities = xml =>
  xml.replaceAll(AMP, "&#57344;").replaceAll("&", AMP)

/**
 * Decodes the entity references {@link shieldEntities} left in a value, in a
 * single pass. An unknown named entity, a character reference outside the
 * Unicode scalar range, or a bare `&` keeps its literal text. That is how a
 * raw `&nbsp;` in a package built by an older muddy comes back.
 *
 * @param {string} value - Shielded text
 * @returns {string} The decoded text
 */
const decodeEntities = value =>
  value.replace(/\uE000(?:(?:#x([0-9a-fA-F]+)|#(\d+)|(\w+));)?/g, (match, hex, dec, name) => {
    if(hex || dec) {
      const point = hex ? parseInt(hex, 16) : parseInt(dec, 10)

      // Lone surrogates can't be written out as UTF-8, so they stay literal.
      if(point <= 0x10FFFF && (point < 0xD800 || point > 0xDFFF))
        return String.fromCodePoint(point)
    } else if(name && Object.hasOwn(ENTITIES, name)) {
      return ENTITIES[name]
    }

    // Anything undecoded, a bare `&` included, keeps its literal text.
    return `&${match.slice(AMP.length)}`
  })

/**
 * Reads the text of an element parsed by xmlbuilder2's object format. Empty
 * elements (`<foo/>`) parse to `{}`, populated ones to their string content.
 *
 * @param {unknown} value - The parsed element value
 * @returns {string} The element text, or "" when empty
 */
const text = value => typeof value === "string" ? decodeEntities(value) : ""

/**
 * Reads an attribute of an element parsed by xmlbuilder2's object format.
 * {@link shieldEntities} covers attribute values too, so they need the same
 * decoding as element text. Otherwise `isOffsetTimer="&#121;es"` would no
 * longer read as "yes".
 *
 * @param {unknown} node - The parsed element
 * @param {string} name - The attribute name, without the `@` prefix
 * @returns {string|undefined} The decoded value, or undefined when absent
 */
const attr = (node, name) => {
  const value = node?.[`@${name}`]

  return typeof value === "string" ? decodeEntities(value) : undefined
}

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
 * Folds xmlbuilder2's mixed-content `"#"` entries back into one object, so a
 * module's fields read as direct keys whichever form it parsed into. The first
 * occurrence of a tag wins, as {@link field} does. Child modules are read
 * separately by {@link Unpack.#childrenOf}, which keeps their order.
 *
 * @param {object} node - The parsed element
 * @returns {object} The element with its `"#"` fields lifted to the top
 */
const fields = node => {
  if(!Array.isArray(node?.["#"]))
    return node

  const entries = node["#"].filter(entry => entry && typeof entry === "object")

  return Object.assign({}, ...entries.reverse(), node)
}

/** Lua 5.1's single-character string escapes. */
const LUA_ESCAPES = Object.freeze({
  a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v",
  "\\": "\\", "\"": "\"", "'": "'", "\n": "\n",
})

/**
 * Decodes the escapes in the body of a quoted Lua 5.1 string. `\ddd` names a
 * byte, so the work is done on the UTF-8 bytes and decoded back at the end,
 * letting a multi-byte character spelled as escapes come out whole. Lua turns
 * any other escaped character into itself; a `\ddd` past 255 is a Lua error,
 * so it is left as written.
 *
 * @param {string} body - The text between the quotes
 * @returns {string} The string's value
 */
const decodeLuaEscapes = body => {
  const bytes = Buffer.from(body, "utf8").toString("latin1")
  const decoded = bytes.replace(/\\(\d{1,3}|[\s\S])/g, (match, escape) => {
    if(/^\d/.test(escape)) {
      const byte = Number(escape)

      return byte <= 255 ? String.fromCharCode(byte) : match
    }

    return LUA_ESCAPES[escape] ?? escape
  })

  return Buffer.from(decoded, "latin1").toString("utf8")
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
   * Names taken in each directory so far, keyed by path, then by lower-cased
   * name so the project works on case-insensitive filesystems too.
   *
   * @type {Map<string, Map<string, {as: "directory"|"file", name: string, owner: string}>>}
   */
  #claims = new Map()
  /**
   * JSON entries gathered for each directory, written once every module has
   * been placed, so folders merged into one directory share one JSON file.
   *
   * @type {Map<string, {directory: DirectoryObject, kind: string, entries: Array<object>}>}
   */
  #pending = new Map()
  /** @type {Map<string, string>} See {@link Unpack.#bareFolder}. */
  #bareFolders = new Map()

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

    const {mpackage} = this.#parseConfig(ctx.configData)

    if(!mpackage)
      throw Sass.new("No 'mpackage' field found in config.lua")

    ctx.packageName = mpackage

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
    const root = create(shieldEntities(xml)).end({format: "object"}).MudletPackage ?? {}

    for(const kind of Type.PLURAL) {
      const single = Type.TO_SINGLE[kind]
      const pkg = root[Type.PACKAGES[kind]]
      const nodes = this.#childrenOf(pkg, single)

      if(nodes.length === 0)
        continue

      glog.info(c`Unpacking {${kind}}${kind}{/}`)

      const kindDirectory = srcDirectory.getDirectory(kind)
      await this.#writeNodes(single, kind, nodes, kindDirectory)
      await this.#writePending()
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
    const entries = this.#entriesFor(kind, directory)

    for(const {node, isFolder} of nodes) {
      if(isFolder) {
        const name = field(node, "name")

        const placement = this.#directoryFor(directory, name)

        if(placement) {
          if(placement === "new") {
            const declaration =
              await this.#declareFolder(single, kind, node, directory)

            if(declaration)
              entries.push(declaration)
          }

          await this.#writeNodes(
            single, kind, this.#childrenOf(node, single),
            directory.getDirectory(name)
          )

          continue
        }
      }

      entries.push(
        await this.#writeDefinition(single, kind, node, isFolder, directory)
      )
    }
  }

  /**
   * The JSON entries for a directory, starting a list on first use. The JSON
   * file's own name is claimed then, so no module can take it.
   *
   * @private
   * @param {string} kind - The plural module type
   * @param {DirectoryObject} directory - The directory
   * @returns {Array<object>} The entries gathered for it
   */
  #entriesFor = (kind, directory) => {
    if(!this.#pending.has(directory.path)) {
      this.#pending.set(directory.path, {directory, kind, entries: []})
      this.#claim(directory, Type.FILES[kind], "file", Type.FILES[kind])
    }

    return this.#pending.get(directory.path).entries
  }

  /**
   * Records a name as taken in a directory, unless something already holds
   * it (compared without case).
   *
   * @private
   * @param {DirectoryObject} directory - The directory
   * @param {string} name - The directory or file name
   * @param {"directory"|"file"} as - What the name is taken as
   * @param {string} owner - The module taking it, for diagnostics
   * @returns {{as: string, name: string, owner: string}|undefined} The earlier claim, if any
   */
  #claim = (directory, name, as, owner) => {
    if(!this.#claims.has(directory.path))
      this.#claims.set(directory.path, new Map())

    const claims = this.#claims.get(directory.path)
    const key = name.toLowerCase()
    const prior = claims.get(key)

    if(!prior)
      claims.set(key, {as, name, owner})

    return prior
  }

  /**
   * Whether a folder can unpack as a subdirectory named after it. That takes
   * a name the filesystem keeps exactly as written, not already taken by a
   * file or a differently-cased folder. A folder repeating an exact sibling
   * name shares that directory, merged, as muddler merges them on build.
   *
   * @private
   * @param {DirectoryObject} directory - The parent directory
   * @param {string} name - The folder name
   * @returns {"new"|"merge"|false} Whether the folder gets a directory of its
   *   own, shares one with a same-named sibling, or stays in the JSON
   */
  #directoryFor = (directory, name) => {
    if(!name || FileSystem.sanitize(name) !== name)
      return false

    const prior = this.#claim(directory, name, "directory", name)

    if(!prior)
      return "new"

    if(prior.as === "directory" && prior.name === name) {
      glog.warn(
        `Folder '${name}' appears more than once in `+
        `${directory.relativeTo(this.#projectDirectory)}; merged their contents.`
      )

      return "merge"
    }

    return false
  }

  /**
   * A directory carries a folder's contents but not its own settings. When
   * the folder differs from what a bare directory builds as (it is disabled,
   * has a script, a trigger group's patterns, an alias group's regex, …),
   * declare it beside its directory: an entry in the parent's JSON, its script
   * in the parent's `.lua`. The build merges the two back into one group, as
   * muddler does.
   *
   * @private
   * @param {string} single - The singular module type
   * @param {string} kind - The plural module type
   * @param {object} node - The parsed folder node
   * @param {DirectoryObject} directory - The parent directory
   * @returns {Promise<object|null>} The declaration, or null when none is needed
   */
  #declareFolder = async(single, kind, node, directory) => {
    const script = field(node, "script")
    const declaration = {
      ...this.#reverseDefinition(single, fields(node)),
      isFolder: "yes",
    }
    const {name: _name, ...settings} = declaration

    if(!script && JSON.stringify(settings) === this.#bareFolder(single, kind))
      return null

    await this.#writeScript(kind, declaration, script, directory)

    return declaration
  }

  /**
   * Writes the JSON file for every directory that gathered entries.
   *
   * @private
   * @returns {Promise<void>}
   */
  #writePending = async() => {
    for(const {directory, kind, entries} of this.#pending.values()) {
      if(entries.length === 0)
        continue

      await directory.assureExists({recursive: true})

      const jsonFile = directory.getFile(Type.FILES[kind])
      await jsonFile.write(`${JSON.stringify(entries, null, 2)}\n`)
      glog.success(
        c`Wrote {${kind}}${jsonFile.relativeTo(this.#projectDirectory)}{/} `+
        `(${entries.length} item${entries.length == 1 ? "" : "s"})`
      )
    }

    this.#pending.clear()
  }

  /**
   * Builds the JSON definition for a module node and writes its `.lua` into
   * the directory. Modules nested under a leaf (a trigger chain, offset timers)
   * become its `children`, folders among them included, with their scripts
   * beside the same JSON file — muddler's layout for nested children.
   *
   * @private
   * @param {string} single - The singular module type
   * @param {string} kind - The plural module type
   * @param {object} node - The parsed module node
   * @param {boolean} isFolder - Whether the node is a group element
   * @param {DirectoryObject} directory - The directory holding the JSON file
   * @returns {Promise<object>} The JSON definition
   */
  #writeDefinition = async(single, kind, node, isFolder, directory) => {
    const definition = isFolder
      ? {
        name: field(node, "name"),
        isActive: attr(node, "isActive") ?? "yes",
        isFolder: "yes",
      }
      : this.#reverseDefinition(single, fields(node))
    const script = field(node, "script")

    await this.#writeScript(kind, definition, script, directory)

    const children = this.#childrenOf(node, single)

    if(children.length > 0) {
      definition.children = []

      for(const child of children) {
        definition.children.push(await this.#writeDefinition(
          single, kind, child.node, child.isFolder, directory
        ))
      }
    }

    return definition
  }

  /**
   * What a folder built from a bare directory reads back as, settings only,
   * serialized for comparison. Made by building that folder and reading its
   * XML the way a package is read, so it tracks the modules' own defaults.
   *
   * @private
   * @param {string} single - The singular module type
   * @param {string} kind - The plural module type
   * @returns {string} The bare folder's settings as JSON
   */
  #bareFolder = (single, kind) => {
    if(!this.#bareFolders.has(kind)) {
      const folder = new Type.CLASS[kind]({name: "bare", isFolder: "yes"}, glog)
      const xml = folder.toXMLFragment().end()
      const parsed = create(shieldEntities(xml)).end({format: "object"})
      const node = parsed[`${Util.capitalize(single)}Group`]
      const {name: _name, ...settings} = {
        ...this.#reverseDefinition(single, fields(node)),
        isFolder: "yes",
      }

      this.#bareFolders.set(kind, JSON.stringify(settings))
    }

    return this.#bareFolders.get(kind)
  }

  /**
   * Gives a module its sibling `.lua`, or keeps the script inline in its JSON
   * entry when the filename is taken or the name has none.
   *
   * @private
   * @param {string} kind - The plural module type
   * @param {object} definition - The module's JSON definition
   * @param {string} script - The module's script
   * @param {DirectoryObject} directory - The directory holding the JSON file
   * @returns {Promise<void>}
   */
  #writeScript = async(kind, definition, script, directory) => {
    const base = Lua.fileName(definition.name)
    const fileName = base && `${base}.lua`
    const prior = fileName
      && this.#claim(directory, fileName, "file", definition.name)

    if(fileName && !prior) {
      // Always lay down a sibling .lua so every JSON entry has the file muddy
      // reloads by name — an empty script becomes an empty stub, matching what
      // `muddy --add` creates, so the project rebuilds without warnings. Only
      // announce the ones that actually carry content to keep output quiet.
      await directory.assureExists({recursive: true})

      const luaFile = directory.getFile(fileName)
      await luaFile.write(script)

      if(script)
        glog.success(c`Wrote {${kind}}${luaFile.relativeTo(this.#projectDirectory)}{/}`)

      return
    }

    // muddy and muddler only read the .lua for an entry with no inline script.
    if(script) {
      definition.script = script
    } else if(prior) {
      glog.warn(
        `'${definition.name}' shares ${fileName} with '${prior.owner}' and `+
        `has no script of its own; a rebuild will give it that script.`
      )
    }
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
      isActive: attr(node, "isActive") ?? "yes",
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

        if(attr(node, "isOffsetTimer") === "yes")
          definition.isOffsetTimer = "yes"

        break
      }

      case "key": {
        const command = text(node.command)

        if(command)
          definition.command = command

        definition.keys = this.#reverseKeys(
          parseInt(text(node.keyCode), 10),
          parseInt(text(node.keyModifier), 10),
          definition.name
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

    if(attr(node, "isMultiline") === "yes") {
      definition.multiline = "yes"

      const delta = text(node.conditonLineDelta)

      if(delta && delta !== "0")
        definition.multilineDelta = delta
    }

    if(attr(node, "isPerlSlashGOption") === "yes")
      definition.matchall = "yes"

    if(attr(node, "isFilterTrigger") === "yes")
      definition.filter = "yes"

    const fireLength = text(node.mStayOpen)

    if(fireLength && fireLength !== "0")
      definition.fireLength = fireLength

    if(attr(node, "isColorizerTrigger") === "yes") {
      definition.highlight = "yes"
      definition.highlightFG = text(node.mFgColor)
      definition.highlightBG = text(node.mBgColor)
    }

    // The build turns any soundFile into isSoundTrigger="yes", so a disabled
    // sound only survives the round trip by leaving it out.
    const soundFile = text(node.mSoundFile)

    if(attr(node, "isSoundTrigger") === "yes" && soundFile)
      definition.soundFile = soundFile
  }

  /**
   * Reconstructs a key chord string (e.g. "Ctrl+Shift+R") from a Qt key code
   * and modifier bitmask — the inverse of Key.js's chord parser.
   *
   * @private
   * @param {number} keyCode - The Qt key code
   * @param {number} keyModifier - The Qt modifier bitmask
   * @param {string} ownerName - Name of the owning Key, for diagnostics
   * @returns {string} The chord string, or "" when there is no bound key
   */
  #reverseKeys = (keyCode, keyModifier, ownerName) => {
    if(!keyCode || keyCode === KEY_UNKNOWN)
      return ""

    const name = KEY_CODE_NAMES.get(keyCode)

    if(!name) {
      glog.warn(
        `Key '${ownerName}' is bound to key code 0x${keyCode.toString(16)}, `+
        `which has no name muddy knows — its chord was left empty.`
      )

      return ""
    }

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

    await Helper.emit(this.#projectDirectory, packageName, glog)

    return ctx
  }

  /**
   * Parses a config.lua file of `key = value` string assignments into a plain
   * object. Mudlet runs the file as Lua and reads the globals, so any Lua
   * string literal counts: a long bracket at any level (`[[…]]`, `[=[…]=]`, …,
   * which is what muddy, muddler and Mudlet write; the level captured in
   * group 2 is matched by the backreference in the closing delimiter), or a
   * single- or double-quoted string with its escapes decoded.
   *
   * @private
   * @param {string} content - The config.lua content
   * @returns {Record<string, string>} The parsed key/value pairs
   */
  #parseConfig = content => {
    const config = {}
    const pattern =
      /(\w+)\s*=\s*(?:\[(=*)\[([\s\S]*?)\]\2\]|(["'])((?:\\[\s\S]|(?!\4)[^\\\n])*)\4)/g

    let match
    while((match = pattern.exec(content)) !== null) {
      const [, key, , long, quote, quoted] = match

      config[key] = quote ? decodeLuaEscapes(quoted) : long
    }

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

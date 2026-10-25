import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {Data, DirectoryObject, FileObject, FileSystem, Promised, Sass, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create, fragment} from "xmlbuilder2"

import Disk from "./Disk.js"
import Lua from "./Lua.js"
import Type from "./Type.js"
import Mfile from "./modules/Mfile.js"

/**
 * Type imports.
 *
 * @import {Glog} from "@gesslar/toolkit"
 * @import {XMLBuilder} from "xmlbuilder2"
 */

let /** @type {Glog} */ glog

const {IF, SPLIT} = ACTIVITY

/**
 * Main Muddy package builder class.
 *
 * Orchestrates the process of converting a source directory structure into
 * a Mudlet package (.mpackage) file by:
 * - Reading package metadata from mfile
 * - Discovering and processing module definitions (scripts, aliases, triggers,
 *   etc.)
 * - Building an XML document representation
 * - Packaging everything into a compressed .mpackage file
 */
export default class Muddy {
  /** @type {DirectoryObject} */
  #projectDirectory
  /** @type {DirectoryObject} */
  #srcDirectory
  /** @type {FileObject} */
  #mfileObject
  /** @type {DirectoryObject} */
  #temp

  /**
   * Main entry point for the Muddy package builder.
   *
   * @param {DirectoryObject} projectDirectory - The root directory of the project to build
   * @param {object} log - Logger instance for output
   * @param {FileObject} [mfileObject] - Optional path to an alternate mfile
   * @returns {Promise<unknown>} The result of the build process
   * @throws {Error} If execution fails at any step
   */
  async run(projectDirectory, log, mfileObject) {
    Valid.type(projectDirectory, "DirectoryObject")
    Valid.type(log, "Glog")

    const srcDirectory = projectDirectory.getDirectory("src")

    this.#projectDirectory = projectDirectory
    this.#srcDirectory = srcDirectory
    this.#mfileObject = mfileObject ?? null

    const temp = mkdtempSync(path.join(os.tmpdir(), "muddy-"))
    this.#temp = new DirectoryObject(temp)

    glog = log

    const builder = new AB(this)
    const runner = new AR(builder)

    try {
      return await runner.run({projectDirectory, srcDirectory})
    } catch(error) {
      throw Sass.new("Executing Muddy.", error)
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
        .do("Read mfile", this.#readMfile)
        .do("Process modules", SPLIT,
          this.#splitPackageDirs,
          this.#rejoinPackageDirs,
          new AB()
            .do("Scan for Package JSON files", this.#scanForPackageJsonFiles)
            .do("Load the discovered JSONs", this.#loadJsonDatums)
            .do("Determine the shape of package branch", this.#mapPackage)
            .do("Discover and load Lua", this.#loadLua)
            .do("Create module from Lua", this.#createModule)
            .do("Generate XML fragment", this.#buildXML)
        )
        .do("Setup temporary workspace", this.#setupTemporaryWorkspace)
        .do("Generate XML Document", this.#generateXMLDocument)
        .do("Generate config.lua", this.#generateConfigLua)
        .do("Process resources", this.#processResources)
        .do("Zzzzzzzzzzip", this.#closeTheBarnDoor)
        .do("Record built stamp", this.#recordBuildStamp)
        .do("Write .output", IF, ctx => ctx.mfile.outputFile, this.#writeOutputFile)
        .done(this.#cleanUp)
    } catch(error) {
      throw Sass.new("Building the action.", error)
    }
  }

  /**
   * Reads and validates the mfile metadata file from the project root.
   *
   * @private
   * @param {DirectoryObject} projectDirectory - The project root directory
   * @returns {Promise<unknown>}
   *   The context with loaded mfile data, or failure object if mfile doesn't exist
   */
  #readMfile = async ctx  => {
    const {projectDirectory} = ctx
    const mfileObject = this.#mfileObject ?? projectDirectory.getFile("mfile")

    if(!await mfileObject.exists)
      throw Sass.new(`No such file ${mfileObject.url}`)

    glog.info(c`Pulling metadata from {other}mfile{/}.`)
    // The mfile is plain JSON, as muddler reads it and `muddy version`
    // rewrites it, so anything else (JSON5, YAML) is rejected here rather than
    // building a project that the other tools can't read.
    let mfile

    try {
      mfile = JSON.parse(await mfileObject.read())
    } catch(error) {
      throw Sass.new(`${mfileObject.name} is not valid JSON: ${error.message}`)
    }

    // Fall back as muddler does, so either tool builds the same package.
    if(!mfile.package) {
      mfile.package = projectDirectory.name
      glog.info(
        c`Package name not set in {other}mfile{/}, using directory name `+
        c`{<B}${mfile.package}{B>}.`
      )
    }

    if(!mfile.version) {
      mfile.version = ""
      glog.info(c`No version set in {other}mfile{/}; building without one.`)
    }

    glog.table(mfile)

    if(mfile.outputFile === true)
      glog.info(
        c`Will write {other}.output{/} JSON file at root of project `+
         `containing package name and .mpackage file path at build end.`
      )

    mfile.ignore = mfile.ignore ?? []
    mfile.description = mfile.description ?? ""

    if(!mfile.description) {
      const readme = projectDirectory.getFile("README.md")

      if(await readme.exists) {
        const content = await readme.read()
        mfile.description = Data.append(content, "\n")

        glog.info(`No description in 'mfile', will use content from existing README.md`)
      } else {
        glog.warn(`No description in 'mfile' and no README.md`)
      }
    }

    return Object.assign(ctx, {mfile})
  }

  /**
   * Splits processing into parallel tasks for each module type (aliases, scripts, triggers, etc.).
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<Array<unknown>>} Array of contexts for each module type
   */
  #splitPackageDirs = async ctx => {
    const {srcDirectory, mfile} = ctx

    return Type.PLURAL.map(e => ({kind: e, srcDirectory, ignore: mfile.ignore}))
  }

  /**
   * Rejoins the split parallel processing results back into the main context.
   *
   * @private
   * @param {object} orig - The original context object
   * @param {Array<Promise>} settled - The settled promises from parallel processing
   * @returns {Promise<unknown>} Context with packages array containing all processed modules
   * @throws {Error} If any of the parallel tasks rejected
   */
  #rejoinPackageDirs = async(orig, settled) => {
    if(Promised.hasRejected(settled))
      Promised.throw(`Processing package JSON files.`, settled)

    const values = Promised.values(settled)

    return Object.assign(orig, {packages: values})
  }

  /**
   * Scans for JSON definition files matching the module type pattern.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} Context with jsonFiles array
   */
  #scanForPackageJsonFiles = async ctx => {
    const {kind, srcDirectory, ignore} = ctx

    glog.info(c`Scanning for {${kind}}${kind}{/}`)

    const pattern = `**/${kind}.json`
    const found = await srcDirectory.glob(pattern)
    const jsonFiles = found.files.filter(
      f => !this.#isIgnored(f.relativeTo(srcDirectory), ignore)
    )

    jsonFiles.forEach(e =>
      glog.success(c`Found {${kind}}${e.relativeTo(srcDirectory)}{/}`)
    )

    return {srcDirectory, kind, jsonFiles}
  }

  /**
   * Loads JSON definition files and normalizes their boolean values.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} Context with jsonModules array
   */
  #loadJsonDatums = async ctx => {
    const {jsonFiles} = ctx

    const jsonModules = []

    for(const jsonFile of jsonFiles) {
      const defs = await jsonFile.loadData()

      this.#normalizeBooleanValues(defs)

      jsonModules.push({jsonFile, jsonDefinitions: defs})
    }

    return Object.assign(ctx, {jsonModules})
  }

  /**
   * Maps JSON modules into a hierarchical package tree structure that mirrors the directory layout.
   *
   * Creates a nested tree where each node represents a directory level, with definitions
   * attached to the appropriate nodes based on their file system location.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} Context with pkg (package tree) property
   */
  #mapPackage = async ctx => {
    const {jsonModules, srcDirectory} = ctx
    const top = srcDirectory.trail.length
    const maptory = () => new Map([
      ["name", ""],
      // Ordered set of child package nodes
      ["children", new Set()],
      // Ordered array of JSON definition objects that live at this node
      ["definitions", []],
      // Ordered array of module instances created from definitions in this subtree
      ["modules", []],
      ["parent", null],
      ["jsonFile", null],
    ])

    const pkg = maptory().set("name", "root")

    // when we go in, we need to:
    // 1. for each item in the trail, create a nested object, using the file
    //    as the key (cos we can find it again!) -> GUI
    // 2. every step that ISN'T the last one, we create a new nest that is a
    //    folder, and we, on the LAST one, do the full one showing the things
    //    like GUI, but also for ThresholdUI (the nested test one)
    for(const {jsonFile, jsonDefinitions} of jsonModules) {
      // Skipping past `top` also drops the kind directory (e.g. "scripts"),
      // which Mudlet does not represent as a folder node, so directories under
      // the kind (e.g. "GUI", "Test Level 1") become the first-level children
      // in the package tree.
      const trail = jsonFile.parent.trail.slice(top + 1)

      // Start from the root package node and walk/create children for each
      // element of the trail so the in-memory tree mirrors the directory tree.
      let node = pkg
      if(trail.length > 0) {
        for(const pieceOfBranch of trail) {
          const children = node.get("children")

          // Reuse an existing child node with the same name if present to
          // preserve both structure and discovery order.
          let child = [...children].find(c => c.get("name") === pieceOfBranch)
          if(!child) {
            child = maptory().set("name", pieceOfBranch)
            children.add(child)
          }

          node = child
        }
      } else {
        // JSON file lives directly under src/, attach it to a child node with
        // an empty name to distinguish it from the virtual "root".
        const children = node.get("children")
        let child = [...children].find(c => c.get("name") === "")
        if(!child) {
          child = maptory().set("name", "")
          children.add(child)
        }

        node = child
      }

      // Attach JSON file and append its definitions at this leaf node.
      node.set("jsonFile", jsonFile)
      const defs = node.get("definitions")
      defs.push(...jsonDefinitions)
    }

    return Object.assign(ctx, {pkg})
  }

  /**
   * Loads Lua script files referenced in JSON definitions.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} The context object
   */
  #loadLua = async ctx => {
    const {kind, pkg, srcDirectory} = ctx

    await this.#_loadLua(kind, pkg, srcDirectory)

    return ctx
  }

  /**
   * Recursively loads Lua scripts for a package tree node and its children.
   *
   * For each definition that references a script file, this loads the .lua file
   * from disk and attaches it to the definition.
   *
   * @private
   * @param {string} kind - The module type
   * @param {object} node - The current package tree node
   * @param {DirectoryObject} srcDirectory - The src directory for relative path resolution
   * @returns {Promise<void>}
   */
  #_loadLua = async(kind, node, srcDirectory) => {
    // First recurse into children so we always walk the whole tree.
    const children = node.get("children")
    for(const child of children)
      await this.#_loadLua(kind, child, srcDirectory)

    const jsonFile = node.get("jsonFile")
    const definitions = node.get("definitions")

    if(!jsonFile || !definitions || definitions.length === 0)
      return

    for(const definition of definitions)
      await this.#loadDefinitionLua(kind, definition, jsonFile, srcDirectory)
  }

  /**
   * Loads the .lua file for one JSON definition, then for each of its nested
   * `children`. Like muddler, every child's script sits beside the JSON file
   * that declares it, however deeply the child is nested.
   *
   * @private
   * @param {string} kind - The module type
   * @param {object} jsonDefinition - The definition to load a script for
   * @param {FileObject} jsonFile - The JSON file that declared it
   * @param {DirectoryObject} srcDirectory - The src directory for relative path resolution
   * @returns {Promise<void>}
   */
  #loadDefinitionLua = async(kind, jsonDefinition, jsonFile, srcDirectory) => {
    const {
      name: scriptName = "", script = "", children = [], isFolder = "no",
    } = jsonDefinition

    for(const child of children)
      await this.#loadDefinitionLua(kind, child, jsonFile, srcDirectory)

    if(!scriptName || script)
      return

    const expected = `${Lua.fileName(scriptName)}.lua`
    const scriptFile = jsonFile.parent.getFile(expected)
    if(!await scriptFile.exists) {
      // A folder's script is optional; a leaf without one is worth a warning.
      if(isFolder !== "yes")
        glog.warn(c`{${kind}}${scriptFile.relativeTo(srcDirectory)}{/} does not exist`)

      jsonDefinition.script = ""
    } else {
      const relative = scriptFile.relativeTo(this.#projectDirectory)
      glog.success(
        c`Using content from {<B}${relative}{B>} for {${kind}}${Type.TO_SINGLE[kind]}{/} {<B}${scriptName}{B>}`
      )

      const loaded = await scriptFile.read()

      jsonDefinition.script = loaded
    }
  }

  /**
   * Creates module instances from the package tree definitions.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {object} The context object
   */
  #createModule = ctx => {
    const {pkg, kind} = ctx
    const cl = Type.CLASS[kind]

    const modules = this.#_createModule(cl, pkg, true)

    pkg.set("modules", modules)

    return ctx
  }

  /**
   * Recursively creates module instances for a package tree node.
   *
   * Creates module instances for all definitions in the tree, wrapping directory
   * structures in folder modules to preserve the hierarchy.
   *
   * @private
   * @param {Function} cl - The module class constructor
   * @param {object} node - The current package tree node
   * @param {boolean} [isRoot=false] - Whether this is the root node
   * @param {object|null} [declared] - The JSON entry declaring this node's
   *   folder, if the parent level has one
   * @param {Set<object>} [skip] - Declarations already merged into a folder,
   *   so they don't also build as modules of their own
   * @returns {Array<unknown>} Array of module instances
   */
  #_createModule = (cl, node, isRoot=false, declared=null, skip=new Set()) => {
    const modules = []
    const children = node.get("children")

    // A folder entry in this level's JSON that names one of its
    // subdirectories declares that subdirectory's folder (to keep it disabled,
    // say, or give it a script). As in muddler, the two build as one group.
    // Top-level JSON lives on a nameless child node, so look there too.
    const levelDefinitions = [
      ...(node.get("definitions") ?? []),
      ...[...children]
        .filter(child => child.get("name") === "")
        .flatMap(child => child.get("definitions") ?? []),
    ]
    const declarations = new Map()

    for(const def of levelDefinitions) {
      if(def.isFolder === "yes" && def.name && !declarations.has(def.name))
        declarations.set(def.name, def)
    }

    const merged = new Set(skip)
    const declarationFor = child => declarations.get(child.get("name"))

    for(const child of children) {
      if(declarationFor(child))
        merged.add(declarationFor(child))
    }

    // Recursively build modules for all children of this node and collect
    // their resulting modules.
    for(const child of children) {
      const childModules = this.#_createModule(
        cl, child, false, declarationFor(child) ?? null, merged
      )
      modules.push(...childModules)
    }

    // Then this node's own definitions become leaf modules, apart from any
    // declarations merged into a directory's folder above.
    const definitions = node.get("definitions")
    if(definitions && definitions.length > 0) {
      for(const def of definitions) {
        if(!merged.has(def))
          modules.push(this.#definitionModule(cl, def))
      }
    }

    // For the root package node we never create a folder wrapper; its modules
    // are the concatenation of its direct children and any nameless/top-level
    // nodes. For any other node with a non-empty name, we wrap its modules in
    // a folder Script/ScriptGroup so that directory structure is preserved.
    if(isRoot) {
      node.set("modules", modules)

      return modules
    }

    const name = node.get("name") ?? ""

    if(name.length > 0 && (modules.length > 0 || declared)) {
      // The declared attributes win over the defaults. The directory's
      // contents come first among the children, then the declared ones.
      const {children: declaredChildren = [], ...attributes} = declared ?? {}
      const folder = new cl({
        isActive: "yes",
        script: "",
        ...attributes,
        name,
        isFolder: "yes",
      }, glog)

      modules.forEach(m => folder.addChild(m))

      for(const child of declaredChildren)
        folder.addChild(this.#definitionModule(cl, child))

      node.set("modules", [folder])

      return [folder]
    }

    node.set("modules", modules)

    return modules
  }

  /**
   * Creates the module for one JSON definition, with modules for its nested
   * `children` attached beneath it.
   *
   * @private
   * @param {Function} cl - The module class constructor
   * @param {object} def - The JSON definition
   * @returns {unknown} The module instance
   */
  #definitionModule = (cl, def) => {
    const module = new cl(def, glog)

    for(const child of def.children ?? [])
      module.addChild(this.#definitionModule(cl, child))

    return module
  }

  /**
   * Builds XML fragments for a package type.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {XMLBuilder} XML fragment for the package
   */
  #buildXML = ctx => {
    const {kind, pkg} = ctx
    const packageTag = Type.PACKAGES[kind]
    const modules = pkg.get("modules") ?? []
    const packageXml = this.#_buildXML(modules, kind)

    const frag = fragment().ele(packageTag).import(packageXml)

    return frag
  }

  /**
   * Builds XML fragments from an array of module instances.
   *
   * @private
   * @param {Array<unknown>} src - An ordered array of modules
   * @returns {XMLBuilder} The XML fragment
   */
  #_buildXML = src => {
    const frag = fragment()

    if(!src || src.length === 0)
      return frag

    for(const module of src)
      frag.import(module.toXMLFragment())

    return frag
  }

  /**
   * Creates a temporary work directory for staging package files.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} Context with workDirectory property
   */
  #setupTemporaryWorkspace = async ctx => {
    ctx.workDirectory = this.#temp.getDirectory("work")
    await ctx.workDirectory.assureExists()

    return ctx
  }

  /**
   * Generates the complete Mudlet package XML document.
   *
   * Combines all module XML fragments into a single MudletPackage XML document
   * with proper DTD declaration.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} Context with xmlFile property
   */
  #generateXMLDocument = async ctx => {
    glog.info(`Generating XML from content`)

    const {packages: xmlFragments, mfile, workDirectory} = ctx

    const root = create({version: "1.0", encoding: "UTF-8"})
      .ele("MudletPackage", {version: "1.001"})
      .dtd("MudletPackage")

    xmlFragments.forEach(e => root.import(e))
    const output = root.end({prettyPrint: true})
      .replaceAll(/(@PKGNAME@|__PKGNAME__)/g, mfile.package)
      .replaceAll(/(@VERSION@|__VERSION__)/g, mfile.version)

    glog.info(c`Substituted all occurrences of {<B}(@PKGNAME@|__PKGNAME__){B>} with {<B}${mfile.package}{B>}`)
    glog.info(c`Substituted all occurrences of {<B}(@VERSION@|__VERSION__){B>} with {<B}${mfile.version}{B>}`)

    const outputFile = workDirectory.getFile(`${mfile.package}.xml`)

    glog.info(`XML generated successfully, writing it to disk`)

    await outputFile.write(output)

    Object.assign(ctx, {xmlFile: outputFile})

    return ctx
  }

  /**
   * Generates the config.lua file with package metadata.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} Context with configFile property
   */
  #generateConfigLua = async ctx => {
    const {mfile, workDirectory} = ctx

    const out = []
    for(const [k,v] of Mfile.MFILE_TO_CONFIG.entries()) {
      const value = mfile[k]

      // Optional fields that are absent or empty are omitted entirely — never
      // serialized as the literal string "undefined" (or an empty value).
      if(value === undefined || value === null || value === "")
        continue

      // If this is icon, we only need the icon's name. Mudlet handles the
      // rest.
      if(k === "icon")
        out.push(`${v} = ${Lua.longString(String(new FileObject(value).name))}`)
      else
        out.push(`${v} = ${Lua.longString(String(value))}`)
    }

    // This isn't sourced anywhere, so we just make it up.
    const now = this.#iso()
    out.push(`created = ${Lua.longString(now)}`)
    const configFile = workDirectory.getFile("config.lua")
    await configFile.write(out.join("\n"))

    ctx.configFile = configFile
    ctx.built = now

    return ctx
  }

  /**
   * Processes resource files (icon, additional files) from src/resources.
   *
   * Copies icon to .mudlet/Icon/ directory and recursively copies all other
   * resources to the work directory.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} The context object
   */
  #processResources = async ctx => {
    const {mfile, workDirectory, srcDirectory} = ctx

    const resourcesDirectory = srcDirectory.getDirectory("resources")
    if(!await resourcesDirectory.exists) {
      glog.warn(
        c`No such directory '${resourcesDirectory.relativeTo(srcDirectory)}'`
      )

      return ctx
    }

    if(mfile.icon) {
      const srcIcon = resourcesDirectory.getFile(mfile.icon)
      if(!await srcIcon.exists) {
        glog.warn(
          c`No such icon file '${srcIcon.relativeTo(srcIcon.parent)}'`
        )
      } else {
        const iconData = await srcIcon.readBinary()
        const destIconDir = workDirectory.getDirectory(".mudlet").getDirectory("Icon")
        await destIconDir.assureExists({recursive: true})

        const destIcon = destIconDir.getFile(srcIcon.name)
        await destIcon.writeBinary(iconData)
      }
    }

    // Now we just literally copy everything from resources into the main work
    // directory. Mudlet will do the same thing, allowing the entire structure
    // to be replicated in a predicktable fashion.
    await this.#recursiveResourcesCopy(
      srcDirectory, resourcesDirectory, workDirectory, mfile.ignore
    )

    return ctx
  }

  /**
   * Copies files from resources to work directory, respecting ignore patterns.
   *
   * Ignore patterns are matched against paths relative to `src`, matching the
   * convention used by the scripts scan in `#scanForPackageJsonFiles`. This
   * way an author's `mfile.ignore` entries have a single, consistent root
   * regardless of which part of the pipeline consumes them.
   *
   * @private
   * @param {DirectoryObject} src - The project `src/` directory (ignore root)
   * @param {DirectoryObject} res - The source resources directory
   * @param {DirectoryObject} work - The destination work directory
   * @param {Array<string>} ignore - Glob patterns to ignore
   * @returns {Promise<void>}
   */
  #recursiveResourcesCopy = async(src, res, work, ignore) => {
    const found = await res.glob("**/*")
    const files = found.files.filter(
      f => !this.#isIgnored(f.relativeTo(src), ignore)
    )

    const settled = await Promised.settle(
      files.map(async file => {
        const relative = file.relativeTo(res)
        const dest = work.getFile(relative)
        await dest.parent.assureExists({recursive: true})
        await file.copy(dest.path)
      })
    )

    if(Promised.hasRejected(settled))
      Promised.throw(`Copying resources.`, settled)
  }

  /**
   * Creates the final .mpackage zip file from the work directory.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} The context object
   */
  #closeTheBarnDoor = async ctx => {
    const {mfile, projectDirectory, workDirectory, xmlFile} = ctx

    const mpackage = new AdmZip()

    glog.info(c`Packaging content of {<B}${workDirectory.path}{B>}`)
    mpackage.addLocalFolder(workDirectory.path)

    const buildDirectory = projectDirectory.getDirectory("build")
    await buildDirectory.assureExists()

    const mpackageFile = buildDirectory.getFile(`${mfile.package}.mpackage`)

    if(await mpackageFile.exists)
      await mpackageFile.delete()

    mpackage.writeZip(mpackageFile.path)
    const size = await mpackageFile.size()

    glog.info(c`{<B}${mpackageFile.path}{B>} written to disk (${size.toLocaleString()} bytes)`)

    const destXmlFile = buildDirectory.getFile(xmlFile.name)
    if(await destXmlFile.exists)
      await destXmlFile.delete()

    await xmlFile.copy(destXmlFile.path)
    const xmlSize = await xmlFile.size()
    glog.info(c`{<B}${destXmlFile.path}{B>} written to disk (${xmlSize.toLocaleString()} bytes)`)

    return Object.assign(ctx, {mpackageFile})
  }

  #recordBuildStamp = async ctx => {
    const {projectDirectory, built} = ctx

    const buildDirectory = projectDirectory.getDirectory("build")
    const buildStampFile = buildDirectory.getFile(".built")

    if(await buildStampFile.exists)
      await buildStampFile.delete()

    await buildStampFile.write(`${built}\n`)

    return ctx
  }

  #writeOutputFile = async ctx => {
    const {mfile, projectDirectory, mpackageFile} = ctx
    const outputFile = projectDirectory.getFile(".output")
    const output = JSON.stringify({
      name: mfile.package,
      path: Data.prepend(FileSystem.relativeOrAbsolute(projectDirectory, mpackageFile), "/")
    })

    await outputFile.write(Data.append(output, "\n"))

    const size = await outputFile.size()
    glog.info(c`{<B}${outputFile.path}{B>} written to disk (${size.toLocaleString()} bytes)`)

    return ctx
  }

  /**
   * Cleans up temporary directory after package creation.
   *
   * @private
   * @param {object} ctx - The context object
   * @returns {Promise<unknown>} The context object
   */
  #cleanUp = async ctx => {
    await Disk.deleteRecursive(this.#temp, true)

    return ctx
  }

  /* Utility methods */

  /**
   * Normalizes boolean values in object entries to 'yes'/'no' strings.
   *
   * Mudlet XML format expects 'yes'/'no' strings rather than true/false booleans.
   *
   * @private
   * @param {Array<unknown>} object - Array of objects to normalize
   * @returns {Array<unknown>} The normalized object array
   */
  #normalizeBooleanValues = object => {
    for(const entry of object) {
      Object.entries(entry).forEach(([k,v]) => {
        if(v === true)
          entry[k] = "yes"
        else if(v === false)
          entry[k] = "no"
      })

      if(Array.isArray(entry.children))
        this.#normalizeBooleanValues(entry.children)
    }

    return object
  }

  /**
   * Generates an ISO 8601 formatted timestamp with timezone.
   *
   * @private
   * @returns {string} ISO timestamp in format YYYY-MM-DDTHH:mm:ss+0000
   */
  #iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+0000")

  /**
   * Checks whether a relative path matches any of the ignore patterns.
   *
   * @private
   * @param {string} relativePath - The relative file path to check
   * @param {Array<string>} patterns - Glob patterns to match against
   * @returns {boolean} True if the path should be ignored
   */
  #isIgnored = (relativePath, patterns) =>
    patterns.length > 0
    && patterns.some(
      pat => path.matchesGlob(relativePath, pat)
    )
}

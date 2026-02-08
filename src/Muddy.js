import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {Data, DirectoryObject, FileObject, FileSystem, Promised, Sass, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create, fragment} from "xmlbuilder2"

import Type from "./Type.js"
import Mfile from "./modules/Mfile.js"

/**
 * Type imports.
 *
 * @import {Glog} from "@gesslar/toolkit"
 * @import {XMLBuilder} from "xmlbuilder2"
 * @import {MfileData, BaseContext, SrcContext} from "./Muddy.d.ts"
 * @import {ModuleTypeContext, JsonFilesContext} from "./Muddy.d.ts"
 * @import {JsonDefinition, JsonModule, JsonModulesContext} from "./Muddy.d.ts"
 * @import {PackageNode, PackageContext, WorkContext} from "./Muddy.d.ts"
 * @import {GeneratedContext, MfileResult} from "./Muddy.d.ts"
 */

let /** @type {Glog} */ glog
let /** @type {string} */ indent

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
  #projectDirectory
  #srcDirectory
  #temp

  /**
   * Main entry point for the Muddy package builder.
   *
   * @param {DirectoryObject} projectDirectory - The root directory of the project to build
   * @param {Glog} log - Logger instance for output
   * @returns {Promise<unknown>} The result of the build process
   * @throws {Error} If execution fails at any step
   */
  async run(projectDirectory, log) {
    Valid.type(projectDirectory, "DirectoryObject")
    Valid.type(log, "Glog")

    this.#projectDirectory = projectDirectory
    this.#srcDirectory = projectDirectory.getDirectory("src")

    const temp = mkdtempSync(path.join(os.tmpdir(), "muddy-"))
    this.#temp = new DirectoryObject(temp)

    glog = log
    indent = c`{OK}•{/} `

    const builder = new AB(this)
    const runner = new AR(builder)

    try {
      return await runner.run({
        projectDirectory: this.#projectDirectory,
        srcDirectory: this.#srcDirectory,
      })
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
   * @returns {Promise<MfileResult>}
   *   The context with loaded mfile data, or failure object if mfile doesn't exist
   */
  #readMfile = async ctx  => {
    const {projectDirectory} = ctx
    const mfileObject = projectDirectory.getFile("mfile")

    if(!await mfileObject.exists)
      throw Sass.new(`No such file ${mfileObject.url}`)

    glog.info(c`Pulling metadata from {other}mfile{/}.`)
    const mfile = await mfileObject.loadData()

    glog.table(mfile)

    if(mfile.outputFile === true)
      glog.info(
        c`Will write {other}.output{/} file at root of project with json `+
         `object containing package name and file location at build end.`
      )

    mfile.description = mfile.description ?? ""

    if(!mfile.description) {
      const readme = projectDirectory.getFile("README.md")

      if(await readme.exists) {
        const content = await readme.read()
        mfile.description = Data.append(content, "\n")

        glog.info(`No description in 'mfile', will use content from existing README.md`)
      } else {
        glog.info(`No description in 'mfile' and no README.md`)
      }
    }

    return Object.assign(ctx, {mfile})
  }

  /**
   * Splits processing into parallel tasks for each module type (aliases, scripts, triggers, etc.).
   *
   * @private
   * @param {SrcContext} ctx - The context object
   * @returns {Promise<Array<ModuleTypeContext>>} Array of contexts for each module type
   */
  #splitPackageDirs = async ctx => {
    const {srcDirectory} = ctx

    return Type.PLURAL.map(e => ({kind: e, srcDirectory}))
  }

  /**
   * Rejoins the split parallel processing results back into the main context.
   *
   * @private
   * @param {SrcContext} orig - The original context object
   * @param {Array<Promise>} settled - The settled promises from parallel processing
   * @returns {Promise<SrcContext & {packages: Array<XMLBuilder>}>} Context with packages array containing all processed modules
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
   * @param {ModuleTypeContext} ctx - The context object
   * @returns {Promise<JsonFilesContext>} Context with jsonFiles array
   */
  #scanForPackageJsonFiles = async ctx => {
    const {kind, srcDirectory} = ctx

    glog.info(c`Scanning for {${kind}}${kind}{/}`)

    const pattern = `**/${kind}.json`
    const found = await srcDirectory.glob(pattern)
    const jsonFiles = found.files

    jsonFiles.forEach(e =>
      glog
        .use(indent)
        .success(c`Found {${kind}}${e.relativeTo(srcDirectory)}{/}`)
    )

    return {srcDirectory, kind, jsonFiles}
  }

  /**
   * Loads JSON definition files and normalizes their boolean values.
   *
   * @private
   * @param {JsonFilesContext} ctx - The context object
   * @returns {Promise<JsonModulesContext>} Context with jsonModules array
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
   * @param {JsonModulesContext} ctx - The context object
   * @returns {Promise<PackageContext>} Context with pkg (package tree) property
   */
  #mapPackage = async ctx => {
    const {jsonModules, srcDirectory, kind} = ctx
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
      let trail = jsonFile.parent.trail.slice(top + 1)

      // The first element in the trail is the kind directory (e.g. "scripts")
      // which Mudlet does not represent as a folder node. Strip it so that
      // directories under the kind (e.g. "GUI", "Test Level 1") become the
      // first-level children in the package tree.
      if(trail.length > 0 && trail[0] === kind)
        trail = trail.slice(1)

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
   * @param {PackageContext} ctx - The context object
   * @returns {Promise<PackageContext>} The context object
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
   * @param {PackageNode} node - The current package tree node
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

    for(const jsonDefinition of definitions) {
      const {name: scriptName = "", script = ""} = jsonDefinition

      if(!scriptName || script)
        continue

      const expected = `${scriptName.replaceAll(/\s/g, "_")}.lua`
      const scriptFile = jsonFile.parent.getFile(expected)
      if(!await scriptFile.exists) {
        glog.warn(c`{${kind}}${scriptFile.relativeTo(srcDirectory)}{/} does not exist`)
        jsonDefinition.script = ""
      } else {
        const relative = scriptFile.relativeTo(this.#projectDirectory)

        glog.success("Using script from", relative, "for", Type.TO_SINGLE[kind], scriptName)

        const loaded = await scriptFile.read()

        jsonDefinition.script = loaded
      }
    }
  }

  /**
   * Creates module instances from the package tree definitions.
   *
   * @private
   * @param {PackageContext} ctx - The context object
   * @returns {PackageContext} The context object
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
   * @param {PackageNode} node - The current package tree node
   * @param {boolean} [isRoot=false] - Whether this is the root node
   * @returns {Array<unknown>} Array of module instances
   */
  #_createModule = (cl, node, isRoot=false) => {
    const modules = []

    // Recursively build modules for all children of this node and collect
    // their resulting modules.
    const children = node.get("children")
    for(const child of children) {
      const childModules = this.#_createModule(cl, child, false)
      modules.push(...childModules)
    }

    // Then this node's own definitions become leaf modules.
    const definitions = node.get("definitions")
    if(definitions && definitions.length > 0) {
      for(const def of definitions)
        modules.push(new cl(def))
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

    if(name.length > 0 && modules.length > 0) {
      const folder = new cl({
        name,
        isFolder: "yes",
        isActive: "yes",
        script: "",
      })

      modules.forEach(m => folder.addChild(m))

      node.set("modules", [folder])

      return [folder]
    }

    node.set("modules", modules)

    return modules
  }

  /**
   * Builds XML fragments for a package type.
   *
   * @private
   * @param {PackageContext} ctx - The context object
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
   * @param {SrcContext & {packages: Array<XMLBuilder>}} ctx - The context object
   * @returns {Promise<WorkContext>} Context with workDirectory property
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
   * @param {WorkContext} ctx - The context object
   * @returns {Promise<WorkContext & {xmlFile: FileObject}>} Context with xmlFile property
   */
  #generateXMLDocument = async ctx => {
    glog.info(`Converting scanned data to Mudlet package XML now`)

    const {packages: xmlFragments, mfile, workDirectory} = ctx

    const root = create({version: "1.0", encoding: "UTF-8"})
      .ele("MudletPackage", {version: "1.001"})
      .dtd("MudletPackage")

    xmlFragments.forEach(e => root.import(e))
    const output = root.end({prettyPrint: true})
      .replaceAll(/(@PKGNAME@|__PKGNAME__)/g, mfile.package)
      .replaceAll(/(@VERSION@|__VERSION__)/g, mfile.version)

    glog.info(`Substituted all instances of '(@PKGNAME@|__PKGNAME__)' with '${mfile.package}'`)
    glog.info(`Substituted all instances of '(@VERSION@|__VERSION__)' with '${mfile.version}'`)

    const outputFile = workDirectory.getFile(`${mfile.package}.xml`)

    glog.info(`XML created successfully, writing it to disk`)

    await outputFile.write(output)

    Object.assign(ctx, {xmlFile: outputFile})

    return ctx
  }

  /**
   * Generates the config.lua file with package metadata.
   *
   * @private
   * @param {WorkContext} ctx - The context object
   * @returns {Promise<WorkContext & {configFile: FileObject}>} Context with configFile property
   */
  #generateConfigLua = async ctx => {
    const {mfile, workDirectory} = ctx

    const out = []
    for(const [k,v] of Mfile.MFILE_TO_CONFIG.entries())
      out.push(`${v} = [[${mfile[k]}]]`)

    // This isn't sourced anywhere, so we just make it up.
    out.push(`created = [[${this.#iso()}]]`)
    const configFile = workDirectory.getFile("config.lua")
    await configFile.write(out.join("\n"))

    ctx.configFile = configFile

    return ctx
  }

  /**
   * Processes resource files (icon, additional files) from src/resources.
   *
   * Copies icon to .mudlet/Icon/ directory and recursively copies all other
   * resources to the work directory.
   *
   * @private
   * @param {GeneratedContext} ctx - The context object
   * @returns {Promise<GeneratedContext>} The context object
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
    await this.#recursiveResourcesCopy(resourcesDirectory, workDirectory)

    return ctx
  }

  /**
   * Recursively copies files and directories from resources to work directory.
   *
   * @private
   * @param {DirectoryObject} res - The source resources directory
   * @param {DirectoryObject} work - The destination work directory
   * @returns {Promise<void>}
   */
  #recursiveResourcesCopy = async(res, work) => {
    const {files, directories} = await res.read()

    await work.assureExists({recursive: true})

    // Witchcraft. I will not be taking questions at this time.
    await Promised.settle(
      [files, directories].flat().map(async e => {
        if(e.isFile) {
          await e.copy(work.getFile(e.name).path)
        } else if(e.isDirectory) {
          await this.#recursiveResourcesCopy(e, work.getDirectory(e.name))
        }
      })
    )
  }

  /**
   * Creates the final .mpackage zip file from the work directory.
   *
   * @private
   * @param {GeneratedContext} ctx - The context object
   * @returns {Promise<GeneratedContext>} The context object
   */
  #closeTheBarnDoor = async ctx => {
    const {mfile, projectDirectory, workDirectory, xmlFile} = ctx

    const mpackage = new AdmZip()

    glog.info(`Adding contents of '${workDirectory.path}'`)
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
   * @param {GeneratedContext} ctx - The context object
   * @returns {Promise<GeneratedContext>} The context object
   */
  #cleanUp = async ctx => {
    await this.#recursiveDelete(this.#temp, true)

    return ctx
  }

  /* Utility methods */

  /**
   * Normalizes boolean values in object entries to 'yes'/'no' strings.
   *
   * Mudlet XML format expects 'yes'/'no' strings rather than true/false booleans.
   *
   * @private
   * @param {Array<JsonDefinition>} object - Array of objects to normalize
   * @returns {Array<JsonDefinition>} The normalized object array
   */
  #normalizeBooleanValues = object => {
    for(const entry of object) {
      Object.entries(entry).forEach(([k,v]) => {
        if(v === true)
          entry[k] = "yes"
        else if(v === false)
          entry[k] = "no"
      })

    }

    return object
  }

  /**
   * Recursively deletes a directory and its contents.
   *
   * @private
   * @param {DirectoryObject} dir - The directory to delete
   * @param {boolean} [includeSelf=false] - Whether to delete the directory itself
   * @returns {Promise<void>}
   */
  #recursiveDelete = async(dir, includeSelf=false) => {
    const {files, directories} = await dir.read()

    await Promised.settle(
      [files, directories].flat().map(async e => {
        if(e.isFile) {
          await e.delete()
        } else if(e.isDirectory) {
          await this.#recursiveDelete(e)

          await e.delete()
        }
      })
    )

    includeSelf && await dir.delete()
  }

  /**
   * Generates an ISO 8601 formatted timestamp with timezone.
   *
   * @private
   * @returns {string} ISO timestamp in format YYYY-MM-DDTHH:mm:ss+0000
   */
  #iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+0000")
}

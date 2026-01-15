import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {DirectoryObject, Promised, Sass, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create, fragment} from "xmlbuilder2"

import Type from "./Type.js"
import Mfile from "./modules/Mfile.js"

let glog
let indent

const {SPLIT} = ACTIVITY

export default class Muddy {
  #projectDirectory
  #temp

  async run(projectDirectory, log) {
    Valid.type(projectDirectory, "DirectoryObject")
    Valid.type(log, "Glog")

    this.#projectDirectory = projectDirectory

    const temp = mkdtempSync(path.join(os.tmpdir(), "muddy-"))
    this.#temp = new DirectoryObject(temp)

    glog = log
    indent = c`{OK}•{/} `

    const builder = new AB(this)
    const runner = new AR(builder)

    try {
      return await runner.run(projectDirectory)
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
        .do("Discover src/ directory", this.#discoverSrcDirectory)
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
        .do("Clean up after ourselves.", this.#cleanUp)
    } catch(error) {
      throw Sass.new("Building the action.", error)
    }
  }

  #readMfile = async projectDirectory => {
    const mfileObject = projectDirectory.getFile("mfile")

    if(!await mfileObject.exists)
      return {fail: true, message: `No such file ${mfileObject.url}`}

    glog.info(c`Pulling metadata from {other}mfile{/}.`)
    const mfile = await mfileObject.loadData()

    glog.table(mfile)
    if(mfile.outputFile === true)
      glog.info(
        c`Will write {other}.output{/} file at root of project with json `+
         `object containing package name and file location at build end.`
      )

    return {projectDirectory, mfile}
  }

  #discoverSrcDirectory = async ctx => {
    const {projectDirectory} = ctx
    const srcDirectory = projectDirectory.getDirectory("src")

    if(!await srcDirectory.exists)
      throw Sass.new(`Missing required directory 'src'`)

    return Object.assign(ctx, {srcDirectory})
  }

  #splitPackageDirs = async ctx => {
    const {srcDirectory} = ctx

    return Type.PLURAL.map(e => ({kind: e, srcDirectory}))
  }

  #rejoinPackageDirs = async(orig, settled) => {
    if(Promised.hasRejected(settled))
      Promised.throw(`Processing package JSON files.`, settled)

    const values = Promised.values(settled)

    return Object.assign(orig, {packages: values})
  }

  #scanForPackageJsonFiles = async ctx => {
    const {kind, srcDirectory} = ctx

    glog.info(c`Scanning for {${kind}}${kind}{/}`)

    const pattern = `**/${kind}.json`
    const found = await srcDirectory.glob(pattern)
    const jsonFiles = found.files

    jsonFiles.forEach(e =>
      glog
        .use(indent)
        .success(c`Found {${kind}}${e.relativeTo(srcDirectory)}{/}`))

    return {srcDirectory, kind, jsonFiles}
  }

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

  #loadLua = async ctx => {
    const {kind, pkg, srcDirectory} = ctx

    await this.#_loadLua(kind, pkg, srcDirectory)

    return ctx
  }

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

      if(!scriptName)
        continue

      if(script)
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

  #createModule = ctx => {
    const {pkg, kind} = ctx
    const cl = Type.CLASS[kind]

    const modules = this.#_createModule(cl, pkg, true)

    pkg.set("modules", modules)

    return ctx
  }

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

  #buildXML = ctx => {
    const {kind, pkg} = ctx
    const packageTag = Type.PACKAGES[kind]
    const modules = pkg.get("modules") ?? []
    const packageXml = this.#_buildXML(modules, kind)

    const frag = fragment().ele(packageTag).import(packageXml)

    return frag
  }

  /**
 * Build a package's XML from its modules
 *
 * @private
   * @param {Array} src - An ordered array of modules generated from this.#createModule
 * @returns {import("xmlbuilder2").XMLBuilder} The XML fragment
 */
  #_buildXML = (src, kind) => {
    const frag = fragment()

    if(!src || src.length === 0)
      return frag

    for(const module of src)
      frag.import(module.toXMLFragment())

    glog.info(kind, "\n", frag.toString({prettyPrint: true}))

    return frag
  }

  #setupTemporaryWorkspace = async ctx => {
    ctx.workDirectory = this.#temp.getDirectory("work")
    await ctx.workDirectory.assureExists()

    return ctx
  }

  #generateXMLDocument = async ctx => {
    glog.info(`Converting scanned data to Mudlet package XML now`)

    const {packages: xmlFragments, mfile, workDirectory} = ctx

    const root = create({version: "1.0", encoding: "UTF-8"})
      .ele("MudletPackage", {version: "1.001"})
      .dtd("MudletPackage")

    xmlFragments.forEach(e => root.import(e))
    const output = root.end({prettyPrint: true})
    const outputFile = workDirectory.getFile(`${mfile.package}.xml`)

    glog.info(`XML created successfully, writing it to disk`)

    await outputFile.write(output)

    ctx.xmlFile = outputFile

    return ctx
  }

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

  #recursiveResourcesCopy = async(res, work) => {
    const {files, directories} = await res.read()

    // let's just use binary since it literally doesn't matter, and will be
    // a byte-for-byte copy rather than caring about encoding-shmencoding.
    await Promised.settle(
      // Witchcraft. I will not be taking questions at this time.
      [files, directories].flat().map(async e => {
        if(e.isFile) {
          const data = await e.read()
          const destFile = work.getFile(e.name)
          await destFile.write(data)
        } else if(e.isDirectory) {
          await this.#recursiveResourcesCopy(e, work.getDirectory(e.name))
        }
      })
    )
    // ^^^ we'll worry about errors later. idk what to do just yet.
  }

  #closeTheBarnDoor = async ctx => {
    const {mfile, projectDirectory, workDirectory} = ctx

    const mpackage = new AdmZip()

    glog.info(`Adding contents of '${workDirectory.path}'`)
    mpackage.addLocalFolder(workDirectory.path)

    const mpackageFile = projectDirectory.getFile(`${mfile.package}.mpackage`)
    if(await mpackageFile.exists)
      await mpackageFile.delete()

    mpackage.writeZip(mpackageFile.path)
    const size = await mpackageFile.size()

    glog.info(`'${mpackageFile.path}' written to disk (${size.toLocaleString()} bytes)`)

    // A robot made me return context even though there's nothing to do now.
    // I hope the ether enjoys the context! Yumyum!
    //
    // Addendum, yes, there IS one more step? It's #cleanUp, but it doesn't use
    // the context. Pedantry doesn't look good on you!
    return ctx
  }

  #cleanUp = async() => {
    await this.#recursiveDelete(this.#temp, true)
  }

  /* Utility methods */

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

  #iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+0000")
}

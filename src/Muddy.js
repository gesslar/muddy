import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {Data, DirectoryObject, Promised, Sass, Valid} from "@gesslar/toolkit"
import AdmZip from "adm-zip"
import {mkdtempSync} from "node:fs"
import os from "node:os"
import path from "node:path"
import {create, fragment} from "xmlbuilder2"

import Type from "./Type.js"
import Mfile from "./modules/Mfile.js"

let glog
let indent, indent2

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
    indent2 = c`{OK}◦{/} `

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
    const {jsonModules, srcDirectory} = ctx
    const top = srcDirectory.trail.length
    const maptory = () => new Map([
      ["name", ""],
      ["contents", new Set()],
      ["modules", new Set()],
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
      const contents = pkg.get("contents")
      const trail = jsonFile.parent.trail.slice(top + 1)

      let last, toAdd

      // We have more than 0 elements in the trail, then we are not at the root
      // level. And now we need to build it out!
      if(trail.length > 0) {
        trail.forEach((pieceOfBranch, index, arr) => {
          const curr = maptory()
            .set("name", pieceOfBranch)
            .set("trail", trail.slice(index+1))

          if(index === 0) {
            toAdd = curr
          } else {
            if(index === arr.length - 1)
              curr.set("contents", new Set(jsonDefinitions))

            last.get("contents").add(curr)
          }

          last = curr
        })
      } else {
        // Ok, this stuff is at the top level (the so-called 'root').
        toAdd = maptory()
          .set("name", "")
          .set("contents", new Set(jsonDefinitions))
      }

      toAdd.set("jsonFile", jsonFile)

      contents.add(toAdd)
    }

    return Object.assign(ctx, {pkg})
  }

  #loadLua = async ctx => {
    const {kind, pkg, srcDirectory} = ctx

    await this.#_loadLua(kind, pkg, null, srcDirectory)

    return ctx
  }

  #_loadLua = async(kind, map, jsonFile=null, srcDirectory) => {
    const contents = map.get("contents")

    jsonFile ??= map.get("jsonFile")

    const settled = await Promised.settle([...contents].map(async content => {
      const inner = content.get("contents")

      if(Data.isType(inner, "Map"))
        return this.#_loadLua(kind, content, content.get("jsonFile") ?? jsonFile, srcDirectory)

      const jsonDefinitions = [...inner]

      for(const jsonDefinition of jsonDefinitions) {
        const {name: scriptName="", script=""} = jsonDefinition

        if(!scriptName)
          continue

        if(script)
          continue

        const expected = `${scriptName.replaceAll(/\s/g, "_")}.lua`
        const scriptFile = content.get("jsonFile").parent.getFile(expected)
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
    }))

    if(Promised.hasRejected(settled))
      Promised.throw("Loading Lua scripts.", settled)
  }

  #createModule = ctx => {
    const {pkg, kind} = ctx
    const cl = Type.CLASS[kind]

    const modules = this.#_createModule(cl, pkg.get("contents"))

    pkg.set("modules", new Set(modules))

    return ctx
  }

  #_createModule = (cl, set) => {
    const result = new Set()

    for(const contents of set) {
      if(Data.isType(contents, "Map") && contents.size > 0)
        result.add(this.#_createModule(cl, contents.get("contents")))

      if(Data.isPlainObject(contents))
        result.add(new cl(contents))
    }

    return result
  }

  #buildXML = ctx => {
    const {kind, pkg} = ctx
    const packageTag = Type.PACKAGES[kind]
    const modules = pkg.get("modules")
    const packageXml = this.#_buildXML(modules, kind)

    const frag = fragment().ele(packageTag).import(packageXml)

    return frag
  }

  /**
 * Build a package's XML from its modules
 *
 * @private
 * @param {Set<Map>} src - A package set generated from this.#createModule
 * @returns {import("xmlbuilder2").XMLBuilder} The XML fragment
 */
  #_buildXML = (src, kind) => {
    const frag = fragment()

    if(src.size === 0)
      return frag

    for(const array of src) {
      if(array.length > 0) {
        for(const module of array) {
          frag.import(module.toXMLFragment())
        }
      }
    }

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
    // Commented out for debugging so we can inspect the temporary workspace.
    // await this.#recursiveDelete(this.#temp, true)
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

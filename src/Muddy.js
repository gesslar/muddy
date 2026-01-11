import {ActionBuilder as AB, ACTIVITY, ActionRunner as AR} from "@gesslar/actioneer"
import c from "@gesslar/colours"
import {Collection, DirectoryObject, Promised, Sass, Valid} from "@gesslar/toolkit"
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
        .do("Fetch schemas", this.#fetchSchemas)
        .do("Validate mfile", this.#validateMfile)
        .do("Discover src/ directory", this.#discoverSrcDirectory)
        .do("Process modules", SPLIT,
          this.#split,
          this.#rejoin,
          new AB()
            .do("Scan for modules", this.#scanForModules)
            .do("Parse modules", SPLIT,
              this.#modulesSplit,
              this.#rejoinModules,
              new AB()
                .do("Load the module", this.#loadModule)
                .do("Discover and load Lua scripts", SPLIT,
                  this.#scriptsSplit,
                  this.#rejoinLoaded,
                  new AB()
                    .do("Discover and load Lua", this.#loadLuaScripts)
                    .do("Create module from Lua", this.#createModule)
                )
            )
        )
        .do("Setup temporary workspace", this.#setupTemporaryWorkspace)
        .do("Generate module XML", SPLIT,
          this.#splitXMLWork,
          this.#rejoinXMLWork,
          new AB()
            .do("Build the module tree", this.#buildModuleTree)
            .do("Generate XML fragment", this.#buildXML)
        )
        .do("Generate XML Document", this.#generateXMLDocument)
        .do("Generate config.lua", this.#generateConfigLua)
        .do("Process resources", this.#processResources)
        .do("Zzzzzzzzzzip", this.#closeTheBarnDoor)
        .do("Clean up after ourselves.", this.#cleanUp)
    } catch(error) {
      throw Sass.new("Building the action.", error)
    }
  }

  #fetchSchemas = async ctx => {
    glog.info("Fetching schemas")

    ctx.schemas = new Map()
    ctx.schemasDirectory = this.#temp.getDirectory("schemas")
    await ctx.schemasDirectory.assureExists()

    const toRetrieve = Object.keys(Type.URL)
    const settled = await Promised.settle(
      toRetrieve.map(async schema => {
        try {
          const tempFilename = `${schema}.json`
          const schemaFile = ctx.schemasDirectory.getFile(tempFilename)
          const url = Type.URL[schema]

          const response = await fetch(url)

          if(!response.ok)
            throw Sass.new(
              `Unable to retrieve schema ${url}: `+
            `${(response).status} ${response.statusText}`
            )

          await schemaFile.write(response.body)
          ctx.schemas.set(schema, schemaFile)

          glog.use(indent).success(c`Fetched {OK}${url.href}{/}`)
        } catch(error) {
          throw Sass.new(`Fetching schema for ${schema}`, error)
        }
      })
    )

    if(Promised.hasRejected(settled))
      Promised.throw("Fetching schemas.", settled)

    return ctx
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

  #validateMfile = async ctx => {
    // const schemaFile = this.#schemaFiles.get("mfile")
    // const schema = TK.Schemer.fromFile(schemaFile)

    // Glog(schema)

    return ctx
  }

  #discoverSrcDirectory = async ctx => {
    const {projectDirectory} = ctx
    const srcDirectory = projectDirectory.getDirectory("src")

    if(!await srcDirectory.exists)
      throw Sass.new(`Missing required directory 'src'`)

    return Object.assign(ctx, {srcDirectory})
  }

  #split = async ctx => {
    const {srcDirectory} = ctx

    return Type.PLURAL.map(e => ({kind: e, srcDirectory}))
  }

  async #rejoin(orig, settled) {
    if(Promised.hasRejected(settled))
      Promised.throw("Processed modules.", settled)

    const values = Promised.values(settled)

    return Object.assign(
      orig,
      {modules: values}
    )
  }

  #scanForModules = async ctx => {
    const {kind, srcDirectory} = ctx
    const pattern = `**/${kind}.json`
    const found = await srcDirectory.glob(pattern)
    const moduleFiles = found.files

    glog.info(c`Scanning for {${kind}}${kind}{/}`)

    if(moduleFiles.length > 0)
      moduleFiles.forEach(e => glog.use(indent).success(
        c`Found {${kind}}${e.relativeTo(srcDirectory)}{/}`)
      )

    return {srcDirectory, kind, moduleFiles}
  }

  #modulesSplit = async ctx => {
    const {moduleFiles, kind, srcDirectory} = ctx

    return moduleFiles.map(e => ({moduleFile: e, kind, srcDirectory}))
  }

  #rejoinModules = async(orig, settled) => {
    if(Promised.hasRejected(settled))
      Promised.throw(`Processing ${orig.kind}.`, settled)

    const values = Promised.values(settled)
    const loaded = values.map(e => e.loaded)

    return Object.assign(orig, {loaded})
  }

  #loadModule = async ctx => {
    const {moduleFile} = ctx
    ctx.module = [moduleFile, []]

    if(!moduleFile)
      return ctx

    if(!await moduleFile.exists)
      return ctx

    const json = await moduleFile.loadData()
    if(!json)
      return ctx

    this.#normalizeBooleanValues(json)

    ctx.module[1].push(...json)

    glog.success("Loaded", moduleFile.relativeTo(this.#projectDirectory))

    return ctx
  }

  #scriptsSplit = async ctx => {
    const {kind, module, srcDirectory} = ctx
    const [moduleFile, scripts] = module
    const moduleDir = moduleFile.parent
    const mapped = scripts.map(e => ({
      moduleDir,
      definition: e,
      kind,
      srcDirectory
    }))

    return mapped
  }

  #rejoinLoaded = async(orig, settled) => {
    if(Promised.hasRejected(settled))
      Promised.throw("Loading Lua scripts.", settled)

    const values  = Promised.values(settled)

    return Object.assign(orig,
      {
        loaded: values.map(e => ({
          definition: e.definition,
          $module: e.module
        })
        )
      }
    )
  }

  #loadLuaScripts = async ctx => {
    const {moduleDir, definition, kind, srcDirectory} = ctx
    const {name: scriptName="", script=""} = definition

    // This should already have been validated out by this point.
    // But we're not doing validation yet.
    if(!scriptName)
      return ctx

    // If there's an inline script, this Trudeaus any file-reference.
    if(script)
      return ctx

    // While folders _can_ have scripts, they would be inline, have already
    // been dealth with above.
    if(definition.isFolder === "no") {
      const expected = `${scriptName.replaceAll(/\s/g, "_")}.lua`
      const scriptFile = moduleDir.getFile(expected)
      if(!await scriptFile.exists) {
        glog.warn(c`{${kind}}${scriptFile.relativeTo(srcDirectory)}{/} does not exist`)
        ctx.definition.script = ""
      } else {
        glog.success(
          "Using script from",
          scriptFile.relativeTo(this.#projectDirectory),
          "for",
          Type.TO_SINGLE[kind],
          `'${scriptName}'`
        )

        ctx.definition.script = await scriptFile.read()
      }
    }

    return ctx
  }

  #createModule = async ctx => {
    const {kind, definition} = ctx

    // Fetch the class constructor
    const cl = Type.CLASS[kind]
    const module = new cl(definition)

    ctx.module = module

    return ctx
  }

  #setupTemporaryWorkspace = async ctx => {
    ctx.workDirectory = this.#temp.getDirectory("work")
    await ctx.workDirectory.assureExists()

    return ctx
  }

  #splitXMLWork = async ctx => {
    const {modules, srcDirectory} = ctx

    const split = modules.map(e => (
      {
        kind: e.kind,
        modules: Collection.zip(
          e.moduleFiles,
          e.loaded,
        ),
        loaded: e.loaded,
        srcDirectory
      }
    ))

    return split
  }

  #rejoinXMLWork = async(original, settled) => {
    if(Promised.hasRejected(settled))
      Promised.throw("Creating XML.", settled)

    original.xmlFragments = Promised.values(settled)

    return original
  }

  #buildModuleTree = async ctx => {
    const {kind, modules, loaded, srcDirectory} = ctx
    const kindClass = Type.CLASS[kind]
    const top = srcDirectory.trail.length

    glog.info(c`Building tree for {${kind}}${kind}{/}`)

    const structure = []
    let fileIndex = 0

    for(const [file] of modules) {
      const local = []
      const trail = file.parent.trail.slice(top)

      local.push(
        new kindClass({
          name: trail.shift(),
          isActive: "yes",
          isFolder: "yes",
        })
      )

      let last = local.at(-1)

      for(const leaf of trail) {
        glog.info(c`Building tree for {${kind}}${leaf}{/}`)
        const newLeaf = new kindClass({
          name: leaf,
          isActive: "yes",
          isFolder: "yes",
        })

        last.addChild(newLeaf)

        last = newLeaf
      }

      const fileLoaded = Array.isArray(loaded[fileIndex])
        ? loaded[fileIndex]
        : []
      for(const {definition, $module} of fileLoaded) {
        glog.use(indent2).info(c`Adding {${kind}}${definition.name}{/}`)

        last.addChild($module)
      }

      fileIndex++
      structure.push(local)
    }

    return {kind, structure}
  }

  #buildXML = async ctx => {
    const {kind, structure: folders} = ctx
    const pkg = Type.PACKAGES[kind]
    const frag = fragment().ele(pkg)

    // folders.forEach(folder => {
    //   folder.forEach(e => {
    //     const children = e.children
    //     const xmlFragments = Array.from(children)
    //       .map(child => {
    //         glog.info(c`XML-izing ${child.constructor.name} => ${child.name}`)

    //         return child.toXMLFragment()
    //       })

    //     xmlFragments.forEach(child => frag.import(child))
    //   })
    // })

    return frag.import(this.#recursiveBuild(folders))
  }

  // Instead of root-based, make it array-based and recurse when you have a new
  // array, and process it when it's just a single item. reverse of
  // recurseDelete. Not parallelizated because order matters here.
  //
  // Note: The AI reviewer added the below comment, supposedly to fend off
  // against vicious cyber-attacks from TypeScript cultists who cargo about
  // their safety nets like they're not lies wrapped in the minifier they call
  // a "compiler." I'll let it stand. Cos it's funny.
  //
  // Uses language features: arrays have .length > 0, non-arrays (Module objects)
  // fail curr.length > 0 (undefined > 0 is false) and fall through to
  // toXMLFragment().
  #recursiveBuild = arr => arr.reduce((acc, curr) => {
    if(curr.length > 0)
      return acc.import(this.#recursiveBuild(curr))

    return acc.import(curr.toXMLFragment())
  }, fragment())

  #generateXMLDocument = async ctx => {
    glog.info(`Converting scanned data to Mudlet package XML now`)

    const {mfile, xmlFragments, workDirectory} = ctx

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

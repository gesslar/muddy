import {after, before, describe, it} from "node:test"
import assert from "node:assert/strict"
import {execFile} from "node:child_process"
import {mkdir, readFile, rm, stat, writeFile} from "node:fs/promises"
import {mkdtempSync} from "node:fs"
import {promisify} from "node:util"
import path from "node:path"
import os from "node:os"
import {fileURLToPath} from "node:url"

import {DirectoryObject, FileObject} from "@gesslar/toolkit"

import Unpack from "../../src/Unpack.js"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, "../../src/cli.js")

/**
 * Runs `muddy <dir>` to build an mpackage.
 *
 * @param {string} dir - Project directory.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function build(dir) {
  return run([CLI, dir])
}

/**
 * Runs `muddy unpack <mpackage> <out>`.
 *
 * @param {string} mpackage - Path to the .mpackage file.
 * @param {string} out - Target project directory.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function unpack(mpackage, out, ...extra) {
  return run([CLI, "unpack", mpackage, out, ...extra])
}

/**
 * Runs the CLI, capturing exit code instead of throwing.
 *
 * @param {Array<string>} args - Arguments to node.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function run(args) {
  try {
    const {stdout, stderr} = await exec("node", args)

    return {stdout, stderr, code: 0}
  } catch(err) {
    return {stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code ?? 1}
  }
}

/**
 * Checks whether a path exists.
 *
 * @param {string} filePath - Absolute path.
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await stat(filePath)

    return true
  } catch {
    return false
  }
}

/**
 * Reads and parses a JSON file.
 *
 * @param {string} filePath - Absolute path.
 * @returns {Promise<*>}
 */
async function readJSON(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"))
}

/**
 * Writes a file, creating parent directories as needed.
 *
 * @param {string} filePath - Absolute path.
 * @param {string|Buffer} content - File content.
 * @returns {Promise<void>}
 */
async function write(filePath, content) {
  await mkdir(path.dirname(filePath), {recursive: true})
  await writeFile(filePath, content)
}

/**
 * Scaffolds a fixture muddy project exercising every module type, a nested
 * folder, a referenced-but-empty script, resources with subdirectories, and an
 * icon. Returns the project directory.
 *
 * @param {string} base - Temp directory.
 * @returns {Promise<string>} The project directory path.
 */
async function scaffold(base) {
  const dir = path.join(base, "RT")
  const src = name => path.join(dir, "src", name)

  await write(path.join(dir, "mfile"), JSON.stringify({
    package: "RT",
    title: "RT title",
    description: "a description",
    version: "1.2.3",
    author: "tester",
    icon: "logo.png",
  }, null, 2) + "\n")

  // scripts: top-level with handlers + nested GUI folder, including an
  // entry with no .lua (empty script) to exercise stub creation.
  await write(src("scripts/scripts.json"), JSON.stringify([
    {name: "Init", isActive: "yes", isFolder: "no", eventHandlerList: ["sysInstall"]},
  ], null, 2) + "\n")
  await write(src("scripts/Init.lua"), "echo(\"init\")\n")
  await write(src("scripts/GUI/scripts.json"), JSON.stringify([
    {name: "Panel", isActive: "yes", isFolder: "no"},
    {name: "Empty", isActive: "yes", isFolder: "no"},
  ], null, 2) + "\n")
  await write(src("scripts/GUI/Panel.lua"), "createPanel()\n")

  // aliases
  await write(src("aliases/aliases.json"), JSON.stringify([
    {name: "Greet", isActive: "yes", isFolder: "no", regex: "^hi$", command: "wave"},
  ], null, 2) + "\n")
  await write(src("aliases/Greet.lua"), "send(\"wave\")\n")

  // triggers: multi-pattern + highlight, and a color pattern
  await write(src("triggers/triggers.json"), JSON.stringify([
    {
      name: "Hit", isActive: "yes", isFolder: "no",
      patterns: [
        {pattern: "you hit", type: "substring"},
        {pattern: "^crit", type: "regex"},
      ],
      command: "smile",
      highlight: "yes", highlightFG: "#00aa7f", highlightBG: "#aa00ff",
    },
    {
      name: "Green", isActive: "yes", isFolder: "no",
      patterns: [{pattern: "2,0", type: "color"}],
    },
  ], null, 2) + "\n")
  await write(src("triggers/Hit.lua"), "echo(\"hit\")\n")
  await write(src("triggers/Green.lua"), "echo(\"green\")\n")

  // timers
  await write(src("timers/timers.json"), JSON.stringify([
    {name: "Tick", isActive: "yes", isFolder: "no", command: "look", time: "00:00:30.000"},
  ], null, 2) + "\n")
  await write(src("timers/Tick.lua"), "send(\"tick\")\n")

  // keys: a chord to exercise reverse key-code reconstruction
  await write(src("keys/keys.json"), JSON.stringify([
    {name: "Clear", isActive: "yes", isFolder: "no", keys: "Ctrl+Shift+C", command: "clr"},
  ], null, 2) + "\n")
  await write(src("keys/Clear.lua"), "clearWindow()\n")

  // resources: icon, a flat file, and a nested file
  await write(src("resources/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await write(src("resources/notes.txt"), "hello resources\n")
  await write(src("resources/vendor/lib.lua"), "return {}\n")

  return dir
}

describe("unpack command", () => {
  let tmpDir

  before(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "muddy-unpack-"))
  })

  after(async() => {
    if(tmpDir) {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it("should expose the unpack subcommand in help", async() => {
    const {stdout} = await exec("node", [CLI, "--help"])
    assert.match(stdout, /unpack/)
  })

  it("should fail on a nonexistent mpackage", async() => {
    const {code} = await unpack(path.join(tmpDir, "nope.mpackage"), path.join(tmpDir, "out-nope"))
    assert.notEqual(code, 0)
  })

  describe("argument validation", () => {
    it("should require a FileObject mpackage", async() => {
      await assert.rejects(
        () => new Unpack().run("not a file", new DirectoryObject("."), {}),
        {message: /FileObject/}
      )
    })

    it("should require a DirectoryObject target", async() => {
      await assert.rejects(
        () => new Unpack().run(new FileObject("x.mpackage"), "not a dir", {}),
        {message: /DirectoryObject/}
      )
    })

    it("should require a Glog logger", async() => {
      await assert.rejects(
        () => new Unpack().run(new FileObject("x.mpackage"), new DirectoryObject("."), "not a glog"),
        {message: /Glog/}
      )
    })
  })

  describe("round-trip", () => {
    let project
    let out

    before(async() => {
      project = await scaffold(tmpDir)
      const buildResult = await build(project)
      assert.equal(buildResult.code, 0, `build failed: ${buildResult.stderr}`)

      out = path.join(tmpDir, "out")
      const unpackResult = await unpack(path.join(project, "build", "RT.mpackage"), out)
      assert.equal(unpackResult.code, 0, `unpack failed: ${unpackResult.stderr}`)
    })

    const o = (...p) => path.join(out, ...p)

    it("recreates the directory structure including nested folders", async() => {
      assert.ok(await exists(o("src", "scripts", "scripts.json")))
      assert.ok(await exists(o("src", "scripts", "GUI", "scripts.json")))
      assert.ok(await exists(o("src", "aliases", "aliases.json")))
      assert.ok(await exists(o("src", "triggers", "triggers.json")))
      assert.ok(await exists(o("src", "timers", "timers.json")))
      assert.ok(await exists(o("src", "keys", "keys.json")))
    })

    it("round-trips a script and its event handlers", async() => {
      const defs = await readJSON(o("src", "scripts", "scripts.json"))
      const init = defs.find(e => e.name === "Init")
      assert.ok(init)
      assert.deepEqual(init.eventHandlerList, ["sysInstall"])
      assert.equal(await readFile(o("src", "scripts", "Init.lua"), "utf8"), "echo(\"init\")\n")
    })

    it("creates an empty .lua stub for a referenced-but-empty script", async() => {
      const defs = await readJSON(o("src", "scripts", "GUI", "scripts.json"))
      assert.ok(defs.find(e => e.name === "Empty"))

      const stub = o("src", "scripts", "GUI", "Empty.lua")
      assert.ok(await exists(stub), "Empty.lua stub should exist")
      assert.equal(await readFile(stub, "utf8"), "")
    })

    it("round-trips an alias", async() => {
      const defs = await readJSON(o("src", "aliases", "aliases.json"))
      const greet = defs.find(e => e.name === "Greet")
      assert.equal(greet.regex, "^hi$")
      assert.equal(greet.command, "wave")
    })

    it("reconstructs trigger patterns with their type names", async() => {
      const defs = await readJSON(o("src", "triggers", "triggers.json"))
      const hit = defs.find(e => e.name === "Hit")
      assert.deepEqual(hit.patterns, [
        {pattern: "you hit", type: "substring"},
        {pattern: "^crit", type: "regex"},
      ])

      const green = defs.find(e => e.name === "Green")
      assert.deepEqual(green.patterns, [{pattern: "2,0", type: "color"}])
    })

    it("reconstructs trigger highlight fields", async() => {
      const defs = await readJSON(o("src", "triggers", "triggers.json"))
      const hit = defs.find(e => e.name === "Hit")
      assert.equal(hit.highlight, "yes")
      assert.equal(hit.highlightFG, "#00aa7f")
      assert.equal(hit.highlightBG, "#aa00ff")
      assert.equal(hit.command, "smile")
    })

    it("round-trips a timer", async() => {
      const defs = await readJSON(o("src", "timers", "timers.json"))
      const tick = defs.find(e => e.name === "Tick")
      assert.equal(tick.command, "look")
      assert.equal(tick.time, "00:00:30.000")
    })

    it("reconstructs a key chord from the stored key code", async() => {
      const defs = await readJSON(o("src", "keys", "keys.json"))
      const clear = defs.find(e => e.name === "Clear")
      assert.equal(clear.keys, "Ctrl+Shift+C")
      assert.equal(clear.command, "clr")
    })

    it("reconstructs the mfile in canonical field order", async() => {
      const mfile = await readJSON(o("mfile"))
      assert.deepEqual(Object.keys(mfile), [
        "package", "title", "description", "version", "author", "icon", "outputFile",
      ])
      assert.equal(mfile.package, "RT")
      assert.equal(mfile.description, "a description")
      assert.equal(mfile.icon, "logo.png")
      assert.equal(mfile.outputFile, true)
    })

    it("restores resources preserving subdirectories", async() => {
      assert.equal(await readFile(o("src", "resources", "notes.txt"), "utf8"), "hello resources\n")
      assert.ok(await exists(o("src", "resources", "vendor", "lib.lua")))
      assert.ok(await exists(o("src", "resources", "logo.png")))
    })

    it("emits a tailored MuddyHelper.lua by default", async() => {
      const helper = o("RT.MuddyHelper.lua")
      assert.ok(await exists(helper), "helper should be emitted")

      const content = await readFile(helper, "utf8")
      assert.match(content, /RTHelper = RTHelper or/, "global named from package")
      assert.match(content, /Muddy:new\(/, "wires up the watcher")
      assert.match(content, /killCache\('RT'\)/, "postremove targets the package")
      assert.ok(content.includes(out), "points the watcher at the unpacked path")
    })

    it("skips the helper with --no-helper", async() => {
      const bare = path.join(tmpDir, "out-no-helper")
      const res = await unpack(path.join(project, "build", "RT.mpackage"), bare, "--no-helper")
      assert.equal(res.code, 0, `unpack failed: ${res.stderr}`)
      assert.ok(await exists(path.join(bare, "mfile")), "still unpacks the project")
      assert.ok(
        !await exists(path.join(bare, "RT.MuddyHelper.lua")),
        "no helper should be emitted"
      )
    })

    it("keeps the description in mfile by default", async() => {
      const mfile = await readJSON(o("mfile"))
      assert.equal(mfile.description, "a description")
      assert.ok(!await exists(o("README.md")), "no README.md by default")
    })

    it("diverts the description to README.md with --readme", async() => {
      const dir = path.join(tmpDir, "out-readme")
      const res = await unpack(path.join(project, "build", "RT.mpackage"), dir, "--readme")
      assert.equal(res.code, 0, `unpack failed: ${res.stderr}`)

      assert.equal(await readFile(path.join(dir, "README.md"), "utf8"), "a description\n")
      const mfile = await readJSON(path.join(dir, "mfile"))
      assert.ok(!("description" in mfile), "description should not be in mfile")
    })

    it("rebuilds to a byte-identical MudletPackage XML (round-trip invariant)", async() => {
      const rebuild = await build(out)
      assert.equal(rebuild.code, 0, `rebuild failed: ${rebuild.stderr}`)

      const original = await readFile(path.join(project, "build", "RT.xml"), "utf8")
      const rebuilt = await readFile(o("build", "RT.xml"), "utf8")
      assert.equal(rebuilt, original)
    })
  })
})

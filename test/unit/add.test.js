import {after, before, describe, it} from "node:test"
import assert from "node:assert/strict"
import {execFile} from "node:child_process"
import {mkdir, readFile, rm, stat, writeFile} from "node:fs/promises"
import {mkdtempSync} from "node:fs"
import {promisify} from "node:util"
import path from "node:path"
import os from "node:os"
import {fileURLToPath} from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, "../../src/cli.js")

/**
 * Runs `muddy --add <type> [--name <name>] <dir>`.
 *
 * @param {string} dir - Project directory.
 * @param {string} type - Module type.
 * @param {string} [name] - Optional module name.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function add(dir, type, name) {
  const args = [CLI, dir, "--add", type]
  if(name) args.push("--name", name)

  try {
    const {stdout, stderr} = await exec("node", args)

    return {stdout, stderr, code: 0}
  } catch(err) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? 1,
    }
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
  const raw = await readFile(filePath, "utf8")

  return JSON.parse(raw)
}

/**
 * Creates a minimal muddy project skeleton (src/ dir only).
 *
 * @param {string} base - Temp directory.
 * @returns {Promise<string>} The project directory path.
 */
async function scaffold(base) {
  const dir = path.join(base, "proj")
  await mkdir(path.join(dir, "src"), {recursive: true})

  return dir
}

describe("add command", () => {
  let tmpDir

  before(() => {
    tmpDir = mkdtempSync(
      path.join(os.tmpdir(), "muddy-add-")
    )
  })

  after(async() => {
    if(tmpDir) {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it("should appear in --help output", async() => {
    const {stdout} = await exec("node", [CLI, "--help"])
    assert.match(stdout, /-a, --add <type>/)
  })

  describe("adding with explicit name", () => {
    let projectDir

    before(async() => {
      projectDir = await scaffold(tmpDir)
    })

    it("should create the type directory and json", async() => {
      await add(projectDir, "script", "My Script")
      const jsonPath = path.join(
        projectDir, "src", "scripts", "scripts.json"
      )
      assert.ok(
        await exists(jsonPath),
        "scripts.json should be created"
      )
    })

    it("should create a .lua file with sanitized name", async() => {
      const luaPath = path.join(
        projectDir, "src", "scripts", "My_Script.lua"
      )
      assert.ok(
        await exists(luaPath),
        "lua file should be created"
      )
    })

    it("should write the correct entry shape for script", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "scripts", "scripts.json"
      ))
      const entry = defs.find(e => e.name === "My Script")
      assert.ok(entry, "entry should exist")
      assert.equal(entry.isActive, "yes")
      assert.equal(entry.isFolder, "no")
      assert.ok(
        Array.isArray(entry.eventHandlerList),
        "should have eventHandlerList"
      )
    })
  })

  describe("adding with auto-generated name", () => {
    let projectDir

    before(async() => {
      projectDir = await scaffold(
        path.join(tmpDir, "auto")
      )
    })

    it("should generate new_alias_1 as temp name", async() => {
      await add(projectDir, "alias")
      const defs = await readJSON(path.join(
        projectDir, "src", "aliases", "aliases.json"
      ))
      assert.equal(defs[0].name, "new_alias_1")
    })

    it("should increment temp name on second add", async() => {
      await add(projectDir, "alias")
      const defs = await readJSON(path.join(
        projectDir, "src", "aliases", "aliases.json"
      ))
      assert.equal(defs.length, 2)
      assert.equal(defs[1].name, "new_alias_2")
    })
  })

  describe("duplicate detection", () => {
    let projectDir

    before(async() => {
      projectDir = await scaffold(
        path.join(tmpDir, "dup")
      )
      await add(projectDir, "timer", "My Timer")
    })

    it("should reject adding a duplicate name", async() => {
      const {code} = await add(
        projectDir, "timer", "My Timer"
      )
      assert.notEqual(code, 0, "should exit with error")
    })

    it("should not add a second entry", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "timers", "timers.json"
      ))
      assert.equal(
        defs.filter(e => e.name === "My Timer").length,
        1,
        "should have exactly one entry"
      )
    })
  })

  describe("unknown type", () => {
    it("should reject an invalid type", async() => {
      const projectDir = await scaffold(
        path.join(tmpDir, "badtype")
      )
      const {code} = await add(projectDir, "bogus")
      assert.notEqual(code, 0)
    })
  })

  describe("missing src directory", () => {
    it("should fail when src/ does not exist", async() => {
      const bare = path.join(tmpDir, "nosrc")
      await mkdir(bare, {recursive: true})
      const {code} = await add(bare, "script")
      assert.notEqual(code, 0)
    })
  })

  describe("appending to existing json", () => {
    let projectDir

    before(async() => {
      projectDir = await scaffold(
        path.join(tmpDir, "existing")
      )
      const typePath = path.join(
        projectDir, "src", "keys"
      )
      await mkdir(typePath, {recursive: true})
      await writeFile(
        path.join(typePath, "keys.json"),
        JSON.stringify([
          {name: "Existing", keys: "f1"},
        ], null, 2) + "\n"
      )
    })

    it("should append without clobbering existing entries", async() => {
      await add(projectDir, "key", "New Key")
      const defs = await readJSON(path.join(
        projectDir, "src", "keys", "keys.json"
      ))
      assert.equal(defs.length, 2)
      assert.equal(defs[0].name, "Existing")
      assert.equal(defs[0].keys, "f1")
      assert.equal(defs[1].name, "New Key")
    })
  })

  describe("schema-shaped entries for each type", () => {
    let projectDir

    before(async() => {
      projectDir = await scaffold(
        path.join(tmpDir, "shapes")
      )
      await add(projectDir, "alias", "a1")
      await add(projectDir, "trigger", "t1")
      await add(projectDir, "timer", "tm1")
      await add(projectDir, "key", "k1")
      await add(projectDir, "script", "s1")
    })

    it("alias should have regex and command fields", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "aliases", "aliases.json"
      ))
      const e = defs[0]
      assert.ok("regex" in e, "should have regex")
      assert.ok("command" in e, "should have command")
    })

    it("trigger should have full schema shape", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "triggers", "triggers.json"
      ))
      const e = defs[0]
      assert.ok(
        Array.isArray(e.patterns),
        "should have patterns array"
      )
      assert.ok(
        e.patterns.length > 0,
        "should have a starter pattern"
      )
      assert.ok("type" in e.patterns[0], "pattern should have type")
      assert.ok("multiline" in e, "should have multiline")
      assert.ok("multilineDelta" in e, "should have multilineDelta")
      assert.ok("matchall" in e, "should have matchall")
      assert.ok("filter" in e, "should have filter")
      assert.ok("fireLength" in e, "should have fireLength")
      assert.ok("highlight" in e, "should have highlight")
      assert.ok("highlightFG" in e, "should have highlightFG")
      assert.ok("highlightBG" in e, "should have highlightBG")
      assert.ok("soundFile" in e, "should have soundFile")
      assert.ok("command" in e, "should have command")
    })

    it("timer should have command and time fields", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "timers", "timers.json"
      ))
      const e = defs[0]
      assert.ok("command" in e, "should have command")
      assert.ok("time" in e, "should have time")
      assert.match(
        e.time, /^\d{2}:\d{2}:\d{2}\.\d{3}$/,
        "time should match hh:mm:ss.mmm format"
      )
    })

    it("key should have command and keys fields", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "keys", "keys.json"
      ))
      const e = defs[0]
      assert.ok("command" in e, "should have command")
      assert.ok("keys" in e, "should have keys")
    })

    it("script should have eventHandlerList", async() => {
      const defs = await readJSON(path.join(
        projectDir, "src", "scripts", "scripts.json"
      ))
      const e = defs[0]
      assert.ok(
        Array.isArray(e.eventHandlerList),
        "should have eventHandlerList array"
      )
    })

    it("all types should have common base fields", async() => {
      const types = [
        ["aliases", "aliases.json"],
        ["triggers", "triggers.json"],
        ["timers", "timers.json"],
        ["keys", "keys.json"],
        ["scripts", "scripts.json"],
      ]

      for(const [dir, file] of types) {
        const defs = await readJSON(path.join(
          projectDir, "src", dir, file
        ))
        const e = defs[0]
        assert.ok("name" in e, `${dir}: should have name`)
        assert.equal(
          e.isActive, "yes",
          `${dir}: isActive should default to yes`
        )
        assert.equal(
          e.isFolder, "no",
          `${dir}: isFolder should default to no`
        )
      }
    })
  })
})

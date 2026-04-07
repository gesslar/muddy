import {after, before, describe, it} from "node:test"
import assert from "node:assert/strict"
import {execFile, spawn} from "node:child_process"
import {readdir, readFile, rm, stat} from "node:fs/promises"
import {mkdtempSync} from "node:fs"
import {promisify} from "node:util"
import path from "node:path"
import os from "node:os"
import {fileURLToPath} from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, "../../src/cli.js")

/**
 * Runs the CLI with -g flag, piping input lines to stdin.
 *
 * @param {string} tmpDir - Working directory for generation.
 * @param {string[]} inputLines - Lines to pipe as stdin.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function generate(tmpDir, inputLines) {
  return new Promise(resolve => {
    const child = spawn(
      "node", [CLI, tmpDir, "-g"],
      {stdio: ["pipe", "pipe", "pipe"]}
    )

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", d => { stdout += d })
    child.stderr.on("data", d => { stderr += d })

    child.stdin.write(
      inputLines.join("\n") + "\n"
    )
    child.stdin.end()

    child.on("close", code => {
      resolve({stdout, stderr, code})
    })
  })
}

/**
 * Checks whether a path exists.
 *
 * @param {string} filePath - Absolute path to check.
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
 * Reads a JSON file and returns the parsed content.
 *
 * @param {string} filePath - Absolute path to JSON file.
 * @returns {Promise<*>}
 */
async function readJSON(filePath) {
  const raw = await readFile(filePath, "utf8")

  return JSON.parse(raw)
}

// All answers accepted, all module types enabled
const ALL_YES = [
  "testpkg",     // name
  "2.0.0",       // version
  "TestAuthor",  // author
  "A test pkg",  // title
  "y",           // scripts
  "y",           // aliases
  "y",           // triggers
  "y",           // keys
  "y",           // timers
  "y",           // gitignore
  "y",           // confirm
]

// All defaults, only scripts (default yes)
const ALL_DEFAULTS = [
  "defpkg",  // name
  "",        // version -> 1.0.0
  "",        // author -> git user
  "",        // title -> default
  "",        // scripts -> y
  "",        // aliases -> n
  "",        // triggers -> n
  "",        // keys -> n
  "",        // timers -> n
  "",        // gitignore -> y
  "",        // confirm -> y
]

describe("--generate / -g option", () => {
  let tmpDir

  before(() => {
    tmpDir = mkdtempSync(
      path.join(os.tmpdir(), "muddy-gen-")
    )
  })

  after(async () => {
    if(tmpDir) {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it("should appear in --help output", async () => {
    const {stdout} = await exec("node", [CLI, "--help"])
    assert.match(stdout, /-g, --generate/)
  })

  describe("full generation with all types", () => {
    let result
    let projectDir

    before(async () => {
      result = await generate(tmpDir, ALL_YES)
      projectDir = path.join(tmpDir, "testpkg")
    })

    it("should exit cleanly", () => {
      assert.equal(result.code, 0)
    })

    it("should create the project directory", async () => {
      assert.ok(
        await exists(projectDir),
        "project directory should exist"
      )
    })

    it("should create the mfile with correct content", async () => {
      const mfile = await readJSON(
        path.join(projectDir, "mfile")
      )
      assert.equal(mfile.package, "testpkg")
      assert.equal(mfile.version, "2.0.0")
      assert.equal(mfile.author, "TestAuthor")
      assert.equal(mfile.title, "A test pkg")
      assert.equal(mfile.outputFile, true)
    })

    it("should create .gitignore", async () => {
      const content = await readFile(
        path.join(projectDir, ".gitignore"), "utf8"
      )
      assert.match(content, /build\//)
      assert.match(content, /\.output/)
    })

    it("should create README.md", async () => {
      const content = await readFile(
        path.join(projectDir, "README.md"), "utf8"
      )
      assert.match(content, /# testpkg/)
      assert.match(content, /A test pkg/)
    })

    it("should generate scripts", async () => {
      const dir = path.join(
        projectDir, "src", "scripts", "testpkg"
      )
      assert.ok(
        await exists(
          path.join(dir, "scripts.json")
        ),
        "scripts.json should exist"
      )
      assert.ok(
        await exists(
          path.join(dir, "testpkg_example_script.lua")
        ),
        "script lua file should exist"
      )

      const defs = await readJSON(
        path.join(dir, "scripts.json")
      )
      assert.equal(defs[0].name, "testpkg_example_script")
      assert.deepEqual(
        defs[0].eventHandlerList, ["sysInstall"]
      )
    })

    it("should generate aliases", async () => {
      const dir = path.join(
        projectDir, "src", "aliases", "testpkg"
      )
      assert.ok(
        await exists(path.join(dir, "aliases.json")),
        "aliases.json should exist"
      )
      assert.ok(
        await exists(path.join(dir, "testpkg.lua")),
        "alias lua file should exist"
      )

      const defs = await readJSON(
        path.join(dir, "aliases.json")
      )
      assert.equal(defs[0].name, "testpkg")
      assert.equal(defs[0].regex, "^testpkg$")
    })

    it("should generate triggers with lua files", async () => {
      const dir = path.join(
        projectDir, "src", "triggers", "testpkg"
      )
      assert.ok(
        await exists(path.join(dir, "triggers.json")),
        "triggers.json should exist"
      )
      assert.ok(
        await exists(path.join(dir, "Rat_out.lua")),
        "Rat_out.lua should exist"
      )
      assert.ok(
        await exists(path.join(dir, "Equilibrium.lua")),
        "Equilibrium.lua should exist"
      )
      assert.ok(
        await exists(
          path.join(dir, "Everything_green.lua")
        ),
        "Everything_green.lua should exist"
      )

      const defs = await readJSON(
        path.join(dir, "triggers.json")
      )
      assert.equal(defs[0].name, "Rats")
      assert.equal(defs[0].isFolder, "yes")
      assert.ok(
        defs[0].children.length > 0,
        "Rats folder should have children"
      )
    })

    it("should generate timers", async () => {
      const dir = path.join(
        projectDir, "src", "timers", "testpkg"
      )
      assert.ok(
        await exists(path.join(dir, "timers.json")),
        "timers.json should exist"
      )
      assert.ok(
        await exists(
          path.join(dir, "testpkg_anti_idle.lua")
        ),
        "timer lua file should exist"
      )

      const defs = await readJSON(
        path.join(dir, "timers.json")
      )
      assert.equal(defs[0].name, "testpkg anti idle")
    })

    it("should generate keys", async () => {
      const dir = path.join(
        projectDir, "src", "keys", "testpkg"
      )
      assert.ok(
        await exists(path.join(dir, "keys.json")),
        "keys.json should exist"
      )
      assert.ok(
        await exists(
          path.join(dir, "Clearscreen.lua")
        ),
        "key lua file should exist"
      )

      const defs = await readJSON(
        path.join(dir, "keys.json")
      )
      assert.equal(defs[0].name, "Clearscreen")
      assert.equal(defs[0].keys, "ctrl+shift+alt+c")
    })
  })

  describe("defaults only (scripts only)", () => {
    let result
    let projectDir

    before(async () => {
      result = await generate(tmpDir, ALL_DEFAULTS)
      projectDir = path.join(tmpDir, "defpkg")
    })

    it("should exit cleanly", () => {
      assert.equal(result.code, 0)
    })

    it("should use default version 1.0.0", async () => {
      const mfile = await readJSON(
        path.join(projectDir, "mfile")
      )
      assert.equal(mfile.version, "1.0.0")
    })

    it("should create scripts (default yes)", async () => {
      assert.ok(
        await exists(path.join(
          projectDir, "src", "scripts",
          "defpkg", "scripts.json"
        )),
        "scripts should be generated by default"
      )
    })

    it("should not create aliases (default no)", async () => {
      assert.ok(
        !await exists(path.join(
          projectDir, "src", "aliases"
        )),
        "aliases should not exist"
      )
    })

    it("should not create triggers (default no)", async () => {
      assert.ok(
        !await exists(path.join(
          projectDir, "src", "triggers"
        )),
        "triggers should not exist"
      )
    })

    it("should not create keys (default no)", async () => {
      assert.ok(
        !await exists(path.join(
          projectDir, "src", "keys"
        )),
        "keys should not exist"
      )
    })

    it("should not create timers (default no)", async () => {
      assert.ok(
        !await exists(path.join(
          projectDir, "src", "timers"
        )),
        "timers should not exist"
      )
    })

    it("should still create .gitignore (default yes)", async () => {
      assert.ok(
        await exists(
          path.join(projectDir, ".gitignore")
        ),
        ".gitignore should exist by default"
      )
    })
  })

  describe("selective generation", () => {
    let projectDir

    before(async () => {
      const input = [
        "selectpkg", // name
        "",          // version
        "",          // author
        "",          // title
        "n",         // scripts: no
        "y",         // aliases: yes
        "n",         // triggers: no
        "y",         // keys: yes
        "n",         // timers: no
        "n",         // gitignore: no
        "y",         // confirm
      ]
      await generate(tmpDir, input)
      projectDir = path.join(tmpDir, "selectpkg")
    })

    it("should not create scripts when declined", async () => {
      assert.ok(
        !await exists(path.join(
          projectDir, "src", "scripts"
        )),
        "scripts should not exist"
      )
    })

    it("should create aliases when selected", async () => {
      assert.ok(
        await exists(path.join(
          projectDir, "src", "aliases",
          "selectpkg", "aliases.json"
        )),
        "aliases should exist"
      )
    })

    it("should create keys when selected", async () => {
      assert.ok(
        await exists(path.join(
          projectDir, "src", "keys",
          "selectpkg", "keys.json"
        )),
        "keys should exist"
      )
    })

    it("should not create .gitignore when declined", async () => {
      assert.ok(
        !await exists(
          path.join(projectDir, ".gitignore")
        ),
        ".gitignore should not exist"
      )
    })
  })

  describe("cancellation", () => {
    it("should not generate when user declines confirmation", async () => {
      const input = [
        "cancelled", // name
        "",          // version
        "",          // author
        "",          // title
        "",          // scripts
        "",          // aliases
        "",          // triggers
        "",          // keys
        "",          // timers
        "",          // gitignore
        "n",         // confirm: no
      ]
      const {code} = await generate(tmpDir, input)
      assert.equal(code, 0, "should exit cleanly")
      assert.ok(
        !await exists(
          path.join(tmpDir, "cancelled")
        ),
        "project directory should not be created"
      )
    })
  })

  describe("empty project name", () => {
    it("should not create anything when name is empty", async () => {
      const before = await readdir(tmpDir)
      const input = [""]
      const {stdout, stderr} = await generate(
        tmpDir, input
      )
      const after = await readdir(tmpDir)
      const output = stdout + stderr
      assert.match(
        output, /required/i,
        "should mention that name is required"
      )
      assert.deepEqual(
        after, before,
        "should not create any new directories"
      )
    })
  })

  describe("existing directory guard", () => {
    it("should refuse to overwrite an existing directory", async () => {
      // "testpkg" was created by the full generation suite
      const input = [
        "testpkg", // already exists
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]
      const {stdout, stderr} = await generate(
        tmpDir, input
      )
      const output = stdout + stderr
      assert.match(
        output, /already exists/i,
        "should warn that directory exists"
      )
    })
  })

  describe("name sanitization", () => {
    let projectDir

    before(async () => {
      const input = [
        "my-cool-pkg", // name with hyphens
        "",
        "",
        "",
        "y",  // scripts
        "y",  // aliases
        "n",
        "n",
        "y",  // timers
        "",
        "y",
      ]
      await generate(tmpDir, input)
      projectDir = path.join(tmpDir, "my-cool-pkg")
    })

    it("should sanitize script lua filename", async () => {
      const dir = path.join(
        projectDir, "src", "scripts", "my-cool-pkg"
      )
      assert.ok(
        await exists(
          path.join(
            dir, "my_cool_pkg_example_script.lua"
          )
        ),
        "script lua file should use sanitized name"
      )
    })

    it("should sanitize script function name in lua", async () => {
      const content = await readFile(
        path.join(
          projectDir, "src", "scripts",
          "my-cool-pkg",
          "my_cool_pkg_example_script.lua"
        ),
        "utf8"
      )
      assert.match(
        content,
        /function my_cool_pkg_example_script/,
        "function name should be a valid Lua identifier"
      )
    })

    it("should sanitize script name in JSON", async () => {
      const defs = await readJSON(
        path.join(
          projectDir, "src", "scripts",
          "my-cool-pkg", "scripts.json"
        )
      )
      assert.equal(
        defs[0].name,
        "my_cool_pkg_example_script"
      )
    })

    it("should sanitize alias lua filename", async () => {
      const dir = path.join(
        projectDir, "src", "aliases", "my-cool-pkg"
      )
      assert.ok(
        await exists(
          path.join(dir, "my_cool_pkg.lua")
        ),
        "alias lua file should use sanitized name"
      )
    })

    it("should sanitize timer lua filename", async () => {
      const dir = path.join(
        projectDir, "src", "timers", "my-cool-pkg"
      )
      assert.ok(
        await exists(
          path.join(dir, "my_cool_pkg_anti_idle.lua")
        ),
        "timer lua file should use sanitized name"
      )
    })
  })
})

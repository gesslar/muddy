import {afterEach, beforeEach, describe, it} from "node:test"
import assert from "node:assert/strict"
import {execFile} from "node:child_process"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {promisify} from "node:util"
import path from "node:path"
import os from "node:os"
import {fileURLToPath} from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, "../../src/cli.js")

/**
 * Runs the CLI in a given working directory and returns {stdout, stderr, code}.
 *
 * @param {string} cwd - Working directory for the CLI subprocess.
 * @param {string[]} args - CLI arguments.
 * @returns {Promise<{stdout: string, stderr: string, code: number|string}>}
 */
async function run(cwd, args) {
  try {
    const {stdout, stderr} = await exec("node", [CLI, ...args], {cwd})
    return {stdout, stderr, code: 0}
  } catch(err) {
    return {stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code ?? 1}
  }
}

/**
 * Writes a minimal mfile with the given version into tmpDir.
 *
 * @param {string} tmpDir - Target directory.
 * @param {string} version - Version string to embed.
 * @returns {Promise<void>}
 */
async function writeMfile(tmpDir, version) {
  const body = JSON.stringify({
    package: "VersionTest",
    version,
    author: "Test"
  }, null, 2) + "\n"

  await writeFile(path.join(tmpDir, "mfile"), body)
}

describe("version subcommand", () => {
  let tmpDir

  beforeEach(async() => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "muddy-version-"))
  })

  afterEach(async() => {
    await rm(tmpDir, {recursive: true, force: true})
  })

  describe("happy paths", () => {
    it("bumps patch: 1.2.3 -> 1.2.4", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0, "should exit cleanly")

      const updated = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(updated.version, "1.2.4")
    })

    it("bumps minor: 1.2.3 -> 1.3.0 (resets patch)", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "minor"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(updated.version, "1.3.0")
    })

    it("bumps major: 1.2.3 -> 2.0.0 (resets minor and patch)", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "major"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(updated.version, "2.0.0")
    })

    it("handles zero components: 0.0.9 -> 0.0.10 (patch)", async() => {
      await writeMfile(tmpDir, "0.0.9")

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(updated.version, "0.0.10")
    })

    it("preserves surrounding file formatting", async() => {
      // Deliberately quirky layout — tabs, extra spaces, ordering — to confirm
      // the regex-based rewrite doesn't normalize anything but the version value.
      const mfile = path.join(tmpDir, "mfile")
      const original = `{\n    "package":     "VersionTest",\n  "version":  "1.2.3",\n\t"author":\t"Test"\n}\n`

      await writeFile(mfile, original)

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0)

      const updated = await readFile(mfile, "utf8")
      assert.equal(updated, original.replace("1.2.3", "1.2.4"))
    })

    it("only rewrites the version key, not other version-looking values", async() => {
      const mfile = path.join(tmpDir, "mfile")
      const body = JSON.stringify({
        package: "VersionTest",
        version: "1.2.3",
        notes: "Legacy 1.2.3 is also referenced here."
      }, null, 2) + "\n"

      await writeFile(mfile, body)

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(mfile, "utf8"))
      assert.equal(updated.version, "1.2.4")
      assert.equal(updated.notes, "Legacy 1.2.3 is also referenced here.")
    })
  })

  describe("sad paths", () => {
    it("fails when no mfile exists in cwd", async() => {
      const {code} = await run(tmpDir, ["version", "patch"])
      assert.notEqual(code, 0)
    })

    it("fails when mfile has no version field", async() => {
      await writeFile(path.join(tmpDir, "mfile"), JSON.stringify({package: "X"}) + "\n")

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.notEqual(code, 0)
    })

    it("fails when version is not a basic SemVer (e.g. '1.2')", async() => {
      await writeMfile(tmpDir, "1.2")

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.notEqual(code, 0)
    })

    it("fails when version has a leading-zero component", async() => {
      // Util.semver.basic disallows leading zeros (e.g. '01.2.3').
      await writeMfile(tmpDir, "01.2.3")

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.notEqual(code, 0)
    })

    it("rejects an unknown kind argument", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code, stderr} = await run(tmpDir, ["version", "wibble"])
      assert.notEqual(code, 0)
      assert.match(stderr, /wibble|choice/i, "should mention the bad argument")
    })

    it("requires a kind argument", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version"])
      assert.notEqual(code, 0)
    })
  })

  describe("current subcommand", () => {
    it("prints the current version on stdout", async() => {
      await writeMfile(tmpDir, "3.14.15")

      const {stdout, code} = await run(tmpDir, ["version", "current"])
      assert.equal(code, 0)
      assert.match(stdout, /^3\.14\.15\s*$/m, "should print bare version, no log prefix")
    })

    it("does not modify the mfile", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const before = await readFile(path.join(tmpDir, "mfile"), "utf8")

      const {code} = await run(tmpDir, ["version", "current"])
      assert.equal(code, 0)

      const after = await readFile(path.join(tmpDir, "mfile"), "utf8")
      assert.equal(after, before, "file should be byte-identical")
    })

    it("fails when no mfile exists in cwd", async() => {
      const {code} = await run(tmpDir, ["version", "current"])
      assert.notEqual(code, 0)
    })

    it("fails when mfile has no version field", async() => {
      await writeFile(path.join(tmpDir, "mfile"), JSON.stringify({package: "X"}) + "\n")

      const {code} = await run(tmpDir, ["version", "current"])
      assert.notEqual(code, 0)
    })
  })

  describe("set subcommand", () => {
    it("sets the version to an explicit value", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "set", "4.5.6"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(updated.version, "4.5.6")
    })

    it("permits setting to a lower version", async() => {
      // No monotonicity check — explicit set is explicit.
      await writeMfile(tmpDir, "5.0.0")

      const {code} = await run(tmpDir, ["version", "set", "1.0.0"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(updated.version, "1.0.0")
    })

    it("preserves surrounding file formatting", async() => {
      const mfile = path.join(tmpDir, "mfile")
      const original = `{\n    "package":     "VersionTest",\n  "version":  "1.2.3",\n\t"author":\t"Test"\n}\n`

      await writeFile(mfile, original)

      const {code} = await run(tmpDir, ["version", "set", "9.9.9"])
      assert.equal(code, 0)

      const updated = await readFile(mfile, "utf8")
      assert.equal(updated, original.replace("1.2.3", "9.9.9"))
    })

    it("rejects a non-SemVer value", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "set", "wibble"])
      assert.notEqual(code, 0)
    })

    it("rejects a partial SemVer (e.g. '1.2')", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "set", "1.2"])
      assert.notEqual(code, 0)
    })

    it("rejects a SemVer with leading-zero component", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "set", "01.2.3"])
      assert.notEqual(code, 0)
    })

    it("requires a value argument", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code} = await run(tmpDir, ["version", "set"])
      assert.notEqual(code, 0)
    })

    it("fails when no mfile exists in cwd", async() => {
      const {code} = await run(tmpDir, ["version", "set", "1.0.0"])
      assert.notEqual(code, 0)
    })
  })
})

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

/**
 * Writes a minimal package.json with the given version into tmpDir.
 *
 * @param {string} tmpDir - Target directory.
 * @param {string} version - Version string to embed.
 * @returns {Promise<void>}
 */
async function writePackageJson(tmpDir, version) {
  const body = JSON.stringify({
    name: "version-test",
    version,
    private: true
  }, null, 2) + "\n"

  await writeFile(path.join(tmpDir, "package.json"), body)
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

    it("updates only the root version, not one nested in a non-flat field", async() => {
      // The mfile isn't fully flat (e.g. `ignore` is an array, `dependencies`
      // can carry versions), so the same root-only protection applies here too.
      const mfile = path.join(tmpDir, "mfile")
      const original = JSON.stringify({
        package: "VersionTest",
        dependencies: [{name: "foo", version: "9.9.9"}],
        version: "1.2.3"
      }, null, 2) + "\n"

      await writeFile(mfile, original)

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0)

      const updated = JSON.parse(await readFile(mfile, "utf8"))
      assert.equal(updated.version, "1.2.4", "root version bumps")
      assert.equal(updated.dependencies[0].version, "9.9.9", "nested dep version untouched")
    })

    it("matches an escaped version key the way JSON.parse decodes it", async() => {
      // Pathological but valid: "version" is the key "version". JSON.parse
      // decodes it, so the scanner must too — otherwise the bump can't find it.
      const mfile = path.join(tmpDir, "mfile")
      const original = `{\n  "package": "VersionTest",\n  "\\u0076ersion": "1.2.3"\n}\n`

      await writeFile(mfile, original)

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0, "should resolve the escaped key to 'version'")

      const updated = await readFile(mfile, "utf8")
      assert.equal(updated, original.replace("1.2.3", "1.2.4"), "key spelling preserved, value bumped")
      assert.equal(JSON.parse(updated).version, "1.2.4")
    })

    it("rejects an mfile that isn't strict JSON (e.g. JSON5 comments)", async() => {
      // The mfile must be plain JSON. A JSON5 comment is rejected with a clear
      // error rather than tolerated, and the file is left untouched.
      const mfile = path.join(tmpDir, "mfile")
      const original = `{\n  // disabled config {\n  "package": "VersionTest",\n  "version": "1.2.3"\n}\n`

      await writeFile(mfile, original)

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch"])
      assert.notEqual(code, 0, "should refuse a non-JSON mfile")
      assert.match(stdout + stderr, /valid JSON/i, "should say the mfile isn't valid JSON")

      const after = await readFile(mfile, "utf8")
      assert.equal(after, original, "mfile should be untouched")
    })

    it("rejects a YAML mfile (must be JSON for bumping)", async() => {
      const mfile = path.join(tmpDir, "mfile")
      const original = `package: VersionTest\nversion: 1.2.3\nauthor: Test\n`

      await writeFile(mfile, original)

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch"])
      assert.notEqual(code, 0, "should refuse a YAML mfile")
      assert.match(stdout + stderr, /valid JSON/i)

      const after = await readFile(mfile, "utf8")
      assert.equal(after, original, "mfile should be untouched")
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

  describe("--package sync", () => {
    it("syncs package.json when bumping with --package", async() => {
      await writeMfile(tmpDir, "1.2.3")
      await writePackageJson(tmpDir, "0.0.1")

      const {code} = await run(tmpDir, ["version", "patch", "--package"])
      assert.equal(code, 0)

      const mfile = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      const pkg = JSON.parse(await readFile(path.join(tmpDir, "package.json"), "utf8"))
      assert.equal(mfile.version, "1.2.4")
      assert.equal(pkg.version, "1.2.4", "package.json should match the mfile")
    })

    it("syncs package.json when setting with --package", async() => {
      await writeMfile(tmpDir, "1.2.3")
      await writePackageJson(tmpDir, "0.0.1")

      const {code} = await run(tmpDir, ["version", "set", "4.5.6", "--package"])
      assert.equal(code, 0)

      const pkg = JSON.parse(await readFile(path.join(tmpDir, "package.json"), "utf8"))
      assert.equal(pkg.version, "4.5.6")
    })

    it("leaves package.json untouched without --package", async() => {
      await writeMfile(tmpDir, "1.2.3")
      await writePackageJson(tmpDir, "0.0.1")

      const {code} = await run(tmpDir, ["version", "patch"])
      assert.equal(code, 0)

      const pkg = JSON.parse(await readFile(path.join(tmpDir, "package.json"), "utf8"))
      assert.equal(pkg.version, "0.0.1", "package.json should be left alone")
    })

    it("preserves package.json formatting", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const pkgPath = path.join(tmpDir, "package.json")
      const original = `{\n  "name":   "version-test",\n\t"version": "0.0.1",\n  "private": true\n}\n`

      await writeFile(pkgPath, original)

      const {code} = await run(tmpDir, ["version", "set", "9.9.9", "--package"])
      assert.equal(code, 0)

      const updated = await readFile(pkgPath, "utf8")
      assert.equal(updated, original.replace("0.0.1", "9.9.9"))
    })

    it("warns but succeeds when --package is given and no package.json exists", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch", "--package"])
      assert.equal(code, 0, "mfile is still bumped, so the command succeeds")
      assert.match(stdout + stderr, /no package\.json/i, "should warn about the missing package.json")

      const mfile = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(mfile.version, "1.2.4")
    })

    it("warns but still bumps the mfile when package.json is not valid JSON", async() => {
      await writeMfile(tmpDir, "1.2.3")
      await writeFile(path.join(tmpDir, "package.json"), "{ not: valid json, }")

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch", "--package"])
      assert.equal(code, 0, "the mfile bump still succeeds")
      assert.match(stdout + stderr, /not valid JSON/i, "should warn the package.json is malformed")

      const mfile = JSON.parse(await readFile(path.join(tmpDir, "mfile"), "utf8"))
      assert.equal(mfile.version, "1.2.4")
    })

    it("warns when --package is given and package.json has no version key", async() => {
      await writeMfile(tmpDir, "1.2.3")
      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify({name: "x"}, null, 2) + "\n")

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch", "--package"])
      assert.equal(code, 0)
      assert.match(stdout + stderr, /no "version" key/i, "should warn about the missing version key")
    })

    it("updates only the root version, not a nested one that appears first", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const pkgPath = path.join(tmpDir, "package.json")
      const original = JSON.stringify({
        config: {version: "9.9.9"},
        name: "version-test",
        version: "0.0.1"
      }, null, 2) + "\n"

      await writeFile(pkgPath, original)

      const {code} = await run(tmpDir, ["version", "set", "4.5.6", "--package"])
      assert.equal(code, 0)

      const pkg = JSON.parse(await readFile(pkgPath, "utf8"))
      assert.equal(pkg.version, "4.5.6", "root version should be synced")
      assert.equal(pkg.config.version, "9.9.9", "nested version should be left alone")
    })

    it("updates only the root version when a nested one shares its value", async() => {
      // Real-world ThresholdUI case: a nested version identical to the root and
      // appearing first must not steal the rewrite.
      await writeMfile(tmpDir, "10.0.0")

      const pkgPath = path.join(tmpDir, "package.json")
      const original = JSON.stringify({
        name: "thresholdui",
        somekey: {version: "10.0.0"},
        version: "10.0.0"
      }, null, 2) + "\n"

      await writeFile(pkgPath, original)

      const {code} = await run(tmpDir, ["version", "set", "11.0.0", "--package"])
      assert.equal(code, 0)

      const pkg = JSON.parse(await readFile(pkgPath, "utf8"))
      assert.equal(pkg.version, "11.0.0", "root version should be bumped")
      assert.equal(pkg.somekey.version, "10.0.0", "nested same-valued version stays put")
    })

    it("warns when only a nested version exists and no root version", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const pkgPath = path.join(tmpDir, "package.json")
      const original = JSON.stringify({
        config: {version: "1.0.0"},
        name: "version-test"
      }, null, 2) + "\n"

      await writeFile(pkgPath, original)

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch", "--package"])
      assert.equal(code, 0)
      assert.match(stdout + stderr, /no "version" key/i, "should warn — no root version to sync")

      const after = await readFile(pkgPath, "utf8")
      assert.equal(after, original, "package.json should be untouched")
    })

    it("suppresses the missing-package.json warning with --no-warn", async() => {
      await writeMfile(tmpDir, "1.2.3")

      const {code, stdout, stderr} = await run(tmpDir, ["version", "patch", "--package", "--no-warn"])
      assert.equal(code, 0)
      assert.doesNotMatch(stdout + stderr, /no package\.json/i, "should stay quiet about the missing package.json")
    })
  })
})

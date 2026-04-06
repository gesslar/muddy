import {describe, it} from "node:test"
import assert from "node:assert/strict"
import {execFile} from "node:child_process"
import {promisify} from "node:util"
import path from "node:path"
import {fileURLToPath} from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, "../../src/cli.js")
const FIXTURES = path.resolve(__dirname, "../fixtures")
const PROJECT = path.join(FIXTURES, "mfile-test")
const ALT_MFILE = path.join(PROJECT, "alt-mfile")
const EXTERNAL_MFILE = path.join(FIXTURES, "alt-mfile-external")

/**
 * Runs the CLI with given args and returns {stdout, stderr, code}.
 *
 * @param {string[]} args - CLI arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function run(args) {
  try {
    const {stdout, stderr} = await exec("node", [CLI, ...args])
    return {stdout, stderr, code: 0}
  } catch(err) {
    return {stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code ?? 1}
  }
}

describe("--mfile / -m option", () => {
  it("should appear in --help output", async () => {
    const {stdout} = await run(["--help"])
    assert.match(stdout, /-m, --mfile <path>/)
  })

  it("should use the default mfile when -m is not specified", async () => {
    const {stdout, code} = await run([PROJECT])
    assert.equal(code, 0, "should exit cleanly")
    assert.match(stdout, /MfileTest/, "should use package name from default mfile")
  })

  it("should use an alternate mfile in the same project directory", async () => {
    const {stdout, code} = await run([PROJECT, "-m", ALT_MFILE])
    assert.equal(code, 0, "should exit cleanly")
    assert.match(stdout, /AltMfileTest/, "should use package name from alt mfile")
  })

  it("should use an mfile located outside the project directory", async () => {
    const {stdout, code} = await run([PROJECT, "-m", EXTERNAL_MFILE])
    assert.equal(code, 0, "should exit cleanly")
    assert.match(stdout, /ExternalMfile/, "should use package name from external mfile")
  })

  it("should fail when -m points to a nonexistent file", async () => {
    const {code} = await run([PROJECT, "-m", "/tmp/does-not-exist-mfile"])
    assert.notEqual(code, 0, "should exit with error")
  })

  it("should fail when project directory lacks src/ even with -m", async () => {
    const {code} = await run([FIXTURES, "-m", EXTERNAL_MFILE])
    assert.notEqual(code, 0, "should exit with error when no src/ dir")
  })

  it("should work with the long form --mfile flag", async () => {
    const {stdout, code} = await run([PROJECT, "--mfile", ALT_MFILE])
    assert.equal(code, 0, "should exit cleanly")
    assert.match(stdout, /AltMfileTest/, "should use package name from alt mfile")
  })
})

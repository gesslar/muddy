import {after, before, describe, it} from "node:test"
import assert from "node:assert/strict"
import {spawn} from "node:child_process"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import process from "node:process"
import {fileURLToPath} from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, "../../src/cli.js")

/**
 * Starts `muddy -w <dir>`, waits for the first build to finish, stops it with
 * `stop`, and resolves with the exit code and everything it printed.
 *
 * @param {string} dir - Project directory.
 * @param {(child: import("node:child_process").ChildProcess) => void} stop - Stops the watcher.
 * @returns {Promise<{code: number|null, output: string}>}
 */
function watchThenStop(dir, stop) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI, "-w", dir], {stdio: ["pipe", "pipe", "pipe"]})
    let output = ""
    let sent = false

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`watch did not exit:\n${output}`))
    }, 10000)

    const onData = data => {
      output += data

      // The first build has written the package; watching starts after it.
      if(!sent && /\.mpackage/.test(output)) {
        sent = true
        setTimeout(() => stop(child), 300)
      }
    }

    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    child.on("close", code => {
      clearTimeout(timer)
      resolve({code, output})
    })
  })
}

describe("watch mode", () => {
  let tmpDir
  let dir

  before(async() => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "muddy-watch-"))
    dir = path.join(tmpDir, "W")
    await mkdir(path.join(dir, "src", "scripts"), {recursive: true})
    await writeFile(path.join(dir, "mfile"), JSON.stringify({package: "W", version: "1.0.0"}) + "\n")
    await writeFile(path.join(dir, "src", "scripts", "scripts.json"), "[{\"name\":\"S\"}]\n")
    await writeFile(path.join(dir, "src", "scripts", "S.lua"), "x=1\n")
  })

  after(async() => {
    await rm(tmpDir, {recursive: true, force: true})
  })

  it("shuts down cleanly on q", async() => {
    const {code, output} = await watchThenStop(dir, child => child.stdin.write("q"))
    assert.equal(code, 0, output)
    assert.match(output, /Exiting\./)
  })

  // Windows can't deliver a signal to a child process (kill() terminates
  // it outright), so these only run where signals exist.
  const noSignals = process.platform === "win32"
    && "Windows cannot send signals to a child process"

  for(const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    it(`shuts down cleanly on ${signal}`, {skip: noSignals}, async() => {
      const {code, output} = await watchThenStop(dir, child => child.kill(signal))
      assert.equal(code, 0, output)
      assert.match(output, /Exiting\./)
    })
  }
})

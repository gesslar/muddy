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
import AdmZip from "adm-zip"
import {create} from "xmlbuilder2"

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

  describe("foreign packages (interleaved siblings)", () => {
    // Muddy emits all folders, then all leaves (contiguous runs), but a package
    // from muddler or a Mudlet export can interleave leaf/group siblings. Those
    // parse into xmlbuilder2's mixed-content "#" form; make sure modules are
    // still extracted (not silently dropped) and leaf load-order is preserved.
    let out

    before(async() => {
      const dir = path.join(tmpDir, "foreign-src")
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE MudletPackage>
<MudletPackage version="1.001">
  <ScriptPackage>
    <Script isActive="yes" isFolder="no">
      <name>Zebra</name><script>z()</script><packageName/><eventHandlerList/>
    </Script>
    <ScriptGroup isActive="yes" isFolder="yes">
      <name>MidFolder</name><script></script><packageName/>
      <Script isActive="yes" isFolder="no">
        <name>Inner</name><script>i()</script><packageName/><eventHandlerList/>
      </Script>
    </ScriptGroup>
    <Script isActive="yes" isFolder="no">
      <name>Alpha</name><script>a()</script><packageName/><eventHandlerList/>
    </Script>
  </ScriptPackage>
</MudletPackage>`
      await write(path.join(dir, "Foreign.xml"), xml)
      await write(path.join(dir, "config.lua"), "mpackage = [[Foreign]]\n")

      const zip = new AdmZip()
      zip.addLocalFolder(dir)
      const mpackage = path.join(tmpDir, "Foreign.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "foreign-out")
      const res = await unpack(mpackage, out, "--no-helper")
      assert.equal(res.code, 0, `unpack failed: ${res.stderr}`)
    })

    it("extracts interleaved leaves and folders (does not drop them)", async() => {
      assert.ok(await exists(path.join(out, "src", "scripts", "scripts.json")))
      assert.ok(await exists(path.join(out, "src", "scripts", "MidFolder", "scripts.json")))
    })

    it("preserves leaf load-order across the interleaved folder", async() => {
      const defs = await readJSON(path.join(out, "src", "scripts", "scripts.json"))
      assert.deepEqual(defs.map(e => e.name), ["Zebra", "Alpha"])

      const inner = await readJSON(path.join(out, "src", "scripts", "MidFolder", "scripts.json"))
      assert.deepEqual(inner.map(e => e.name), ["Inner"])
    })
  })

  describe("folder whose own name lands in mixed content", () => {
    // When a folder holds non-contiguous leaf/group runs (a Mudlet export of a
    // folder containing both scripts and subfolders — e.g. Script, ScriptGroup,
    // Script), xmlbuilder2 pushes the folder's OWN <name> into the mixed-content
    // "#" array instead of a direct key. A naive node.name then reads "", and
    // unpack crashes building a directory with an empty name. The folder name
    // must still resolve, and its leaves and subfolders survive. (Regression
    // from a real export — EleUI2's "UI" group has exactly this shape.)
    let out

    before(async() => {
      const dir = path.join(tmpDir, "mixedname-src")
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE MudletPackage>
<MudletPackage version="1.001">
  <ScriptPackage>
    <ScriptGroup isActive="yes" isFolder="yes">
      <name>Outer</name><script></script><packageName/>
      <Script isActive="yes" isFolder="no">
        <name>First</name><script>f()</script><packageName/><eventHandlerList/>
      </Script>
      <ScriptGroup isActive="yes" isFolder="yes">
        <name>Nested</name><script></script><packageName/>
        <Script isActive="yes" isFolder="no">
          <name>Deep</name><script>d()</script><packageName/><eventHandlerList/>
        </Script>
      </ScriptGroup>
      <Script isActive="yes" isFolder="no">
        <name>Second</name><script>s()</script><packageName/><eventHandlerList/>
      </Script>
    </ScriptGroup>
  </ScriptPackage>
</MudletPackage>`
      await write(path.join(dir, "Mixed.xml"), xml)
      await write(path.join(dir, "config.lua"), "mpackage = [[Mixed]]\n")

      const zip = new AdmZip()
      zip.addLocalFolder(dir)
      const mpackage = path.join(tmpDir, "Mixed.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "mixedname-out")
      const res = await unpack(mpackage, out, "--no-helper")
      assert.equal(res.code, 0, `unpack failed: ${res.stderr}`)
    })

    it("resolves the folder name (does not unpack to an empty dir name)", async() => {
      assert.ok(await exists(path.join(out, "src", "scripts", "Outer", "scripts.json")))
    })

    it("keeps the folder's leaves, in document order across the subfolder", async() => {
      const defs = await readJSON(path.join(out, "src", "scripts", "Outer", "scripts.json"))
      assert.deepEqual(defs.map(e => e.name), ["First", "Second"])
    })

    it("recurses into the nested subfolder", async() => {
      const inner = await readJSON(
        path.join(out, "src", "scripts", "Outer", "Nested", "scripts.json")
      )
      assert.deepEqual(inner.map(e => e.name), ["Deep"])
    })
  })

  describe("resource sharing the package XML's filename", () => {
    // The package XML is excluded by relative path, not basename, so a resource
    // in a subdirectory that happens to share the XML's filename is kept.
    let out

    before(async() => {
      const dir = path.join(tmpDir, "collide-src")
      const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        + "<!DOCTYPE MudletPackage>\n<MudletPackage version=\"1.001\">\n"
        + "<ScriptPackage/>\n</MudletPackage>"
      await write(path.join(dir, "Coll.xml"), xml)
      await write(path.join(dir, "config.lua"), "mpackage = [[Coll]]\n")
      // a resource whose basename collides with the root package XML
      await write(path.join(dir, "vendor", "Coll.xml"), "<keep>me</keep>")

      const zip = new AdmZip()
      zip.addLocalFolder(dir)
      const mpackage = path.join(tmpDir, "Coll.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "collide-out")
      const res = await unpack(mpackage, out, "--no-helper")
      assert.equal(res.code, 0, `unpack failed: ${res.stderr}`)
    })

    it("keeps the same-named resource in its subdirectory", async() => {
      const kept = path.join(out, "src", "resources", "vendor", "Coll.xml")
      assert.ok(await exists(kept), "same-named resource should be kept")
      assert.equal(await readFile(kept, "utf8"), "<keep>me</keep>")
    })
  })

  describe("config.lua values containing ]]", () => {
    // A description with ]] (e.g. a README showing Lua long strings) must not
    // truncate the field or emit invalid Lua. Build picks a safe bracket level
    // (#luaLongString) and unpack matches it (#parseConfig).
    let out
    const DESC = "See [[long]] strings and a bare ]] in your docs"

    before(async() => {
      const dir = path.join(tmpDir, "brackets-src")
      await write(path.join(dir, "mfile"), JSON.stringify({
        package: "Brk", version: "1.0.0", author: "t", description: DESC,
      }, null, 2) + "\n")
      await write(path.join(dir, "src", "scripts", "scripts.json"), "[{\"name\":\"S\"}]\n")
      await write(path.join(dir, "src", "scripts", "S.lua"), "x=1\n")

      const b = await build(dir)
      assert.equal(b.code, 0, `build failed: ${b.stderr}`)

      out = path.join(tmpDir, "brackets-out")
      const u = await unpack(path.join(dir, "build", "Brk.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("round-trips a description containing ]] without truncation", async() => {
      const mfile = await readJSON(path.join(out, "mfile"))
      assert.equal(mfile.description, DESC)
    })
  })

  describe("missing optional mfile fields", () => {
    // Absent optional fields (icon, title, description) must be omitted from
    // config.lua, not serialized as the literal string "undefined".
    let out

    before(async() => {
      const dir = path.join(tmpDir, "minimal-src")
      await write(path.join(dir, "mfile"), JSON.stringify({
        package: "Min", version: "2.0.0", author: "t",
      }, null, 2) + "\n")
      await write(path.join(dir, "src", "scripts", "scripts.json"), "[{\"name\":\"S\"}]\n")
      await write(path.join(dir, "src", "scripts", "S.lua"), "x=1\n")

      const b = await build(dir)
      assert.equal(b.code, 0, `build failed: ${b.stderr}`)

      out = path.join(tmpDir, "minimal-out")
      const u = await unpack(path.join(dir, "build", "Min.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("are omitted from the rebuilt mfile (no \"undefined\")", async() => {
      const mfile = await readJSON(path.join(out, "mfile"))
      assert.deepEqual(
        Object.keys(mfile).sort(),
        ["author", "outputFile", "package", "version"]
      )
      assert.ok(!Object.values(mfile).includes("undefined"))
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
      assert.match(content, /local name = \[\[RT\]\]/, "package name wrapped safely")
      assert.match(content, /killCache\(name\)/, "postremove targets the package")
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

    // Regression guard for the unpack→rebuild mapping on a muddy-built package:
    // if the reverse mapping drifts, the rebuilt XML diverges. Not a promise we
    // make about arbitrary packages — foreign ones normalize (see the
    // foreign-packages tests).
    it("a muddy-built project rebuilds cleanly after unpacking", async() => {
      const rebuild = await build(out)
      assert.equal(rebuild.code, 0, `rebuild failed: ${rebuild.stderr}`)

      const original = await readFile(path.join(project, "build", "RT.xml"), "utf8")
      const rebuilt = await readFile(o("build", "RT.xml"), "utf8")
      assert.equal(rebuilt, original)
    })
  })

  describe("illegal filename characters in module names", () => {
    // A module name is free text, but its sibling .lua is named after it. A name
    // carrying a filesystem-illegal character (here `/`, which getFile would
    // otherwise treat as a path separator, and `:`) must collapse to a single
    // safe filename on both sides — build derives it to read the script, unpack
    // derives it to write it — so the module still round-trips by name rather
    // than vanishing into a stray subdirectory or an unwritable path.
    let srcDir
    let out

    before(async() => {
      srcDir = path.join(tmpDir, "illegal-src")
      await write(path.join(srcDir, "mfile"), JSON.stringify({
        package: "Illegal", version: "1.0.0", author: "t",
      }, null, 2) + "\n")
      // JSON keeps the illegal name; the .lua lives at the sanitized base.
      await write(path.join(srcDir, "src", "scripts", "scripts.json"),
        "[{\"name\":\"Foo:Bar/Baz\"}]\n")
      await write(path.join(srcDir, "src", "scripts", "Foo_Bar_Baz.lua"), "echo(\"ok\")\n")

      const b = await build(srcDir)
      assert.equal(b.code, 0, `build failed: ${b.stderr}`)

      out = path.join(tmpDir, "illegal-out")
      const u = await unpack(path.join(srcDir, "build", "Illegal.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    const o = (...p) => path.join(out, ...p)

    it("writes the .lua at the sanitized name with its content intact", async() => {
      // Content surviving proves the build resolved the script by the sanitized
      // name (an unresolved one would unpack to an empty stub).
      assert.equal(await readFile(o("src", "scripts", "Foo_Bar_Baz.lua"), "utf8"), "echo(\"ok\")\n")
    })

    it("does not let `/` in the name leak into a subdirectory", async() => {
      assert.ok(
        !await exists(o("src", "scripts", "Foo:Bar")),
        "the slash must not split the name into a nested path"
      )
    })

    it("preserves the original illegal name in the JSON", async() => {
      const defs = await readJSON(o("src", "scripts", "scripts.json"))
      assert.deepEqual(defs.map(e => e.name), ["Foo:Bar/Baz"])
    })

    it("rebuilds cleanly, reproducing the original XML byte-for-byte", async() => {
      const rebuild = await build(out)
      assert.equal(rebuild.code, 0, `rebuild failed: ${rebuild.stderr}`)

      const original = await readFile(path.join(srcDir, "build", "Illegal.xml"), "utf8")
      const rebuilt = await readFile(o("build", "Illegal.xml"), "utf8")
      assert.equal(rebuilt, original)
    })
  })

  describe("entity-like text (#88)", () => {
    // Lua that builds HTML for Mudlet labels is full of `&nbsp;` and friends.
    // xmlbuilder2 left entity-shaped text unescaped on build, so Mudlet hit an
    // undefined entity and cut the script off there. On unpack it re-escaped
    // `<`/`&` and decoded `&amp;#160;` twice. Every `&` must be written as
    // `&amp;` and every field must come back out verbatim.
    let srcDir
    let out
    const TEXT = "<b>&nbsp;HP:</b> &amp; &#160; &#x41; & AT&T amp;"
    const LUA = `hpbar:echo([[${TEXT}]])\n`

    before(async() => {
      srcDir = path.join(tmpDir, "entity-src")
      const src = name => path.join(srcDir, "src", name)

      await write(path.join(srcDir, "mfile"), JSON.stringify({
        package: "Ent", version: "1.0.0", author: "t",
      }, null, 2) + "\n")
      await write(src("scripts/scripts.json"), JSON.stringify([
        {name: "S", eventHandlerList: [TEXT]},
      ]) + "\n")
      await write(src("scripts/S.lua"), LUA)
      await write(src("aliases/aliases.json"), JSON.stringify([
        {name: "A", regex: TEXT, command: TEXT},
      ]) + "\n")
      await write(src("triggers/triggers.json"), JSON.stringify([
        {name: "T", patterns: [{pattern: TEXT, type: "substring"}], command: TEXT},
      ]) + "\n")
      await write(src("timers/timers.json"), JSON.stringify([
        {name: "Ti", command: TEXT, time: "00:00:01.000"},
      ]) + "\n")
      await write(src("keys/keys.json"), JSON.stringify([
        {name: "K", keys: "F1", command: TEXT},
      ]) + "\n")

      const b = await build(srcDir)
      assert.equal(b.code, 0, `build failed: ${b.stderr}`)

      out = path.join(tmpDir, "entity-out")
      const u = await unpack(path.join(srcDir, "build", "Ent.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    const o = (...p) => path.join(out, ...p)

    it("escapes every & in the built XML", async() => {
      const xml = await readFile(path.join(srcDir, "build", "Ent.xml"), "utf8")
      const escaped =
        "&lt;b&gt;&amp;nbsp;HP:&lt;/b&gt; &amp;amp; &amp;#160; &amp;#x41; &amp; AT&amp;T"

      // script, handler, alias regex + command, trigger pattern + command,
      // timer command, key command
      assert.equal(xml.split(escaped).length - 1, 8)
      assert.ok(!xml.includes("&nbsp;"), "no raw &nbsp; may reach Mudlet")
    })

    it("round-trips the script verbatim", async() => {
      assert.equal(await readFile(o("src", "scripts", "S.lua"), "utf8"), LUA)
    })

    it("round-trips event handler names", async() => {
      const [s] = await readJSON(o("src", "scripts", "scripts.json"))
      assert.deepEqual(s.eventHandlerList, [TEXT])
    })

    it("round-trips alias regex and command", async() => {
      const [a] = await readJSON(o("src", "aliases", "aliases.json"))
      assert.equal(a.regex, TEXT)
      assert.equal(a.command, TEXT)
    })

    it("round-trips trigger patterns and command", async() => {
      const [t] = await readJSON(o("src", "triggers", "triggers.json"))
      assert.deepEqual(t.patterns, [{pattern: TEXT, type: "substring"}])
      assert.equal(t.command, TEXT)
    })

    it("round-trips timer and key commands", async() => {
      const [ti] = await readJSON(o("src", "timers", "timers.json"))
      const [k] = await readJSON(o("src", "keys", "keys.json"))
      assert.equal(ti.command, TEXT)
      assert.equal(k.command, TEXT)
    })

    it("rebuilds cleanly, reproducing the original XML byte-for-byte", async() => {
      const rebuild = await build(out)
      assert.equal(rebuild.code, 0, `rebuild failed: ${rebuild.stderr}`)

      const original = await readFile(path.join(srcDir, "build", "Ent.xml"), "utf8")
      const rebuilt = await readFile(o("build", "Ent.xml"), "utf8")
      assert.equal(rebuilt, original)
    })
  })

  describe("raw &nbsp; in a package built by an older muddy", () => {
    // Pre-#88 builds wrote `&nbsp;` unescaped. Unpacking one should recover
    // the source text rather than drop or mangle the reference.
    let out

    before(async() => {
      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\">",
        "  <ScriptPackage>",
        "    <Script isActive=\"yes\" isFolder=\"no\">",
        "      <name>Old</name>",
        "      <script>echo([[&lt;b&gt;&nbsp;HP &constructor; &toString; R & D &nbsp &#99999999; &#x110000; &#xD800;]])</script>",
        "      <packageName/>",
        "      <eventHandlerList/>",
        "    </Script>",
        "  </ScriptPackage>",
        "</MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Old.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Old]]\n"))
      const mpackage = path.join(tmpDir, "Old.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "old-out")
      const u = await unpack(mpackage, out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("keeps unknown entities like &nbsp; as literal text", async() => {
      assert.equal(
        await readFile(path.join(out, "src", "scripts", "Old.lua"), "utf8"),
        "echo([[<b>&nbsp;HP &constructor; &toString; R & D &nbsp &#99999999; &#x110000; &#xD800;]])"
      )
    })
  })

  describe("character references in attribute flags", () => {
    // Entity shielding covers attribute values too, so flags must be decoded
    // like element text. `&#121;es` is a valid spelling of "yes".
    let out
    const Y = "&#121;es"

    before(async() => {
      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\">",
        "  <TriggerPackage>",
        `    <Trigger isActive="&#110;o" isFolder="no" isMultiline="${Y}" `
          + `isPerlSlashGOption="${Y}" isFilterTrigger="${Y}" isColorizerTrigger="${Y}">`,
        "      <name>T</name><script/><packageName/>",
        "      <mCommand/><mFgColor>#ff0000</mFgColor><mBgColor>#000000</mBgColor>",
        "      <regexCodeList><string>x</string></regexCodeList>",
        "      <regexCodePropertyList><integer>0</integer></regexCodePropertyList>",
        "    </Trigger>",
        "  </TriggerPackage>",
        "  <TimerPackage>",
        `    <Timer isActive="yes" isFolder="no" isOffsetTimer="${Y}">`,
        "      <name>Ti</name><script/><packageName/>",
        "      <command/><time>00:00:01.000</time>",
        "    </Timer>",
        "  </TimerPackage>",
        "</MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Flags.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Flags]]\n"))
      const mpackage = path.join(tmpDir, "Flags.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "flags-out")
      const u = await unpack(mpackage, out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("decodes trigger flags", async() => {
      const [t] = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      assert.equal(t.isActive, "no")
      assert.equal(t.multiline, "yes")
      assert.equal(t.matchall, "yes")
      assert.equal(t.filter, "yes")
      assert.equal(t.highlight, "yes")
    })

    it("decodes the timer offset flag", async() => {
      const [ti] = await readJSON(path.join(out, "src", "timers", "timers.json"))
      assert.equal(ti.isOffsetTimer, "yes")
    })

    it("rebuilds cleanly", async() => {
      const rebuild = await build(out)
      assert.equal(rebuild.code, 0, `rebuild failed: ${rebuild.stderr}`)
    })
  })

  describe("config.lua value ending in ]", () => {
    // A trailing `]` would fuse with a plain `]]` closer, so the build has to
    // pick a higher bracket level for it, and unpack has to read it back whole.
    let out
    const TITLE = "Foo [beta]"

    before(async() => {
      const dir = path.join(tmpDir, "trailing-src")
      await write(path.join(dir, "mfile"), JSON.stringify({
        package: "Trl", version: "1.0.0", author: "t", title: TITLE,
      }, null, 2) + "\n")
      await write(path.join(dir, "src", "scripts", "scripts.json"), "[{\"name\":\"S\"}]\n")
      await write(path.join(dir, "src", "scripts", "S.lua"), "x=1\n")

      const b = await build(dir)
      assert.equal(b.code, 0, `build failed: ${b.stderr}`)

      out = path.join(tmpDir, "trailing-out")
      const u = await unpack(path.join(dir, "build", "Trl.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("round-trips the title intact", async() => {
      const mfile = await readJSON(path.join(out, "mfile"))
      assert.equal(mfile.title, TITLE)
    })
  })

  describe("subfolder named after its kind", () => {
    // `src/scripts/scripts/` is a real folder called "scripts", not the kind
    // directory, so it must stay a ScriptGroup through build and unpack.
    let dir
    let out

    before(async() => {
      dir = path.join(tmpDir, "kindname-src")
      await write(path.join(dir, "mfile"), JSON.stringify({
        package: "Kn", version: "1.0.0", author: "t",
      }, null, 2) + "\n")
      await write(path.join(dir, "src", "scripts", "scripts", "scripts.json"), "[{\"name\":\"inner\"}]\n")
      await write(path.join(dir, "src", "scripts", "scripts", "inner.lua"), "x=1\n")

      const b = await build(dir)
      assert.equal(b.code, 0, `build failed: ${b.stderr}`)

      out = path.join(tmpDir, "kindname-out")
      const u = await unpack(path.join(dir, "build", "Kn.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("builds the subfolder as a ScriptGroup", async() => {
      const xml = await readFile(path.join(dir, "build", "Kn.xml"), "utf8")
      assert.match(xml, /<ScriptGroup[^>]*>\s*<name>scripts<\/name>/)
    })

    it("unpacks the script back inside the subfolder", async() => {
      const defs = await readJSON(path.join(out, "src", "scripts", "scripts", "scripts.json"))
      assert.deepEqual(defs.map(e => e.name), ["inner"])
      assert.ok(!await exists(path.join(out, "src", "scripts", "scripts.json")))
    })
  })

  describe("trigger sound flag", () => {
    // The build enables the sound whenever soundFile is present, so a trigger
    // with its sound switched off must come back without one.
    let out

    before(async() => {
      const trigger = (name, flag) => [
        `    <Trigger isActive="yes" isFolder="no" isSoundTrigger="${flag}">`,
        `      <name>${name}</name><script/><packageName/><mCommand/>`,
        "      <mSoundFile>ding.wav</mSoundFile>",
        "      <regexCodeList><string>x</string></regexCodeList>",
        "      <regexCodePropertyList><integer>0</integer></regexCodePropertyList>",
        "    </Trigger>",
      ].join("\n")

      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\">",
        "  <TriggerPackage>",
        trigger("Off", "no"),
        trigger("On", "yes"),
        "  </TriggerPackage>",
        "</MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Snd.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Snd]]\n"))
      const mpackage = path.join(tmpDir, "Snd.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "snd-out")
      const u = await unpack(mpackage, out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("keeps a disabled sound disabled", async() => {
      const [off, on] = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      assert.equal(off.name, "Off")
      assert.ok(!("soundFile" in off))
      assert.equal(on.soundFile, "ding.wav")
    })
  })

  describe("key codes beyond the basics", () => {
    // Mudlet binds any Qt key. Named ones come back as chords; one muddy has
    // no name for is left empty, with a warning instead of silence.
    let out
    let unpacked
    const CTRL = 0x04000000

    before(async() => {
      const key = (name, code, mod) => [
        "    <Key isActive=\"yes\" isFolder=\"no\">",
        `      <name>${name}</name><packageName/><script/><command/>`,
        `      <keyCode>${code}</keyCode><keyModifier>${mod}</keyModifier>`,
        "    </Key>",
      ].join("\n")

      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\">",
        "  <KeyPackage>",
        key("Clr", 0x0100000b, 0),
        key("Mnu", 0x01000055, CTRL),
        key("Agr", 0xc0, 0),
        key("Odd", 0x01234567, 0),
        "  </KeyPackage>",
        "</MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Kc.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Kc]]\nversion = [[1.0.0]]\n"))
      const mpackage = path.join(tmpDir, "Kc.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "kc-out")
      unpacked = await unpack(mpackage, out, "--no-helper")
      assert.equal(unpacked.code, 0, `unpack failed: ${unpacked.stderr}`)
    })

    it("unpacks named keys to chords", async() => {
      const keys = await readJSON(path.join(out, "src", "keys", "keys.json"))
      assert.deepEqual(
        keys.map(k => [k.name, k.keys]),
        [["Clr", "Clear"], ["Mnu", "Ctrl+Menu"], ["Agr", "Agrave"], ["Odd", ""]]
      )
    })

    it("warns about a key code it has no name for", () => {
      assert.match(unpacked.stdout + unpacked.stderr, /Odd.*0x1234567/)
    })

    it("rebuilds the named keys with their codes", async() => {
      const b = await build(out)
      assert.equal(b.code, 0, `rebuild failed: ${b.stderr}`)

      const xml = await readFile(path.join(out, "build", "Kc.xml"), "utf8")
      assert.match(xml, new RegExp(`<keyCode>${0x0100000b}</keyCode>`))
      assert.match(xml, new RegExp(`<keyCode>${0x01000055}</keyCode>\\s*<keyModifier>${CTRL}</keyModifier>`))
      assert.match(xml, /<keyCode>192<\/keyCode>/)
    })
  })

  describe("nested children (muddler layout)", () => {
    // muddler nests modules with a `children` array in the JSON, scripts for
    // all of them beside that JSON file. Under a leaf that is a trigger chain
    // or offset timers; a child with isFolder "yes" is a group. The tail
    // trigger after the group makes Prompt's children interleave on unpack.
    let dir
    let out
    let built
    let triggers
    let timers

    // Read the built XML whichever form xmlbuilder2 parses an element into;
    // interleaved children land in its mixed-content "#" array.
    const get = (node, key) =>
      node?.[key] ?? node?.["#"]?.find(e => e && key in e)?.[key]
    const kids = (node, tag) => (Array.isArray(node?.["#"])
      ? node["#"].flatMap(e => [e?.[tag] ?? []].flat())
      : [node?.[tag] ?? []].flat())
    const names = (node, tag) => kids(node, tag).map(n => get(n, "name"))

    before(async() => {
      dir = path.join(tmpDir, "nested-src")
      await write(path.join(dir, "mfile"), JSON.stringify({
        package: "Nest", version: "1.0.0", author: "t",
      }, null, 2) + "\n")

      await write(path.join(dir, "src", "triggers", "triggers.json"), JSON.stringify([
        {
          name: "Prompt",
          patterns: [{pattern: "", type: "prompt"}],
          children: [
            {name: "health", patterns: [{pattern: "(\\d+)h", type: "regex"}]},
            {
              name: "flags",
              filter: true,
              patterns: [{pattern: "(.*)", type: "regex"}],
              children: [{name: "Eq", patterns: [{pattern: "e", type: "substring"}]}],
            },
            {name: "Grp", isFolder: "yes", children: [{name: "inner", patterns: [{pattern: "i", type: "substring"}]}]},
            {name: "tail", patterns: [{pattern: "t", type: "substring"}]},
          ],
        },
      ], null, 2) + "\n")
      for(const name of ["Prompt", "health", "flags", "Eq", "inner", "tail"])
        await write(path.join(dir, "src", "triggers", `${name}.lua`), `-- ${name}\n`)

      await write(path.join(dir, "src", "timers", "timers.json"), JSON.stringify([
        {name: "Base", seconds: "5", children: [{name: "Later", seconds: "2", isOffsetTimer: "yes"}]},
      ], null, 2) + "\n")
      for(const name of ["Base", "Later"])
        await write(path.join(dir, "src", "timers", `${name}.lua`), `-- ${name}\n`)

      built = await build(dir)
      assert.equal(built.code, 0, `build failed: ${built.stderr}`)

      const xml = await readFile(path.join(dir, "build", "Nest.xml"), "utf8")
      const root = create(xml).end({format: "object"}).MudletPackage
      triggers = root.TriggerPackage
      timers = root.TimerPackage

      out = path.join(tmpDir, "nested-out")
      const u = await unpack(path.join(dir, "build", "Nest.mpackage"), out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)
    })

    it("builds without missing-script warnings, folders included", () => {
      assert.doesNotMatch(built.stdout + built.stderr, /does not exist/)
    })

    it("nests a trigger chain inside its leaf trigger", () => {
      const [prompt] = kids(triggers, "Trigger")
      assert.equal(get(prompt, "name"), "Prompt")
      assert.equal(get(prompt, "@isFolder"), "no")
      assert.equal(get(prompt, "script"), "-- Prompt\n")
      assert.deepEqual(names(prompt, "Trigger"), ["health", "flags", "tail"])
      assert.deepEqual(names(prompt, "TriggerGroup"), ["Grp"])

      const flags = kids(prompt, "Trigger").find(t => get(t, "name") === "flags")
      assert.equal(get(flags, "@isFilterTrigger"), "yes")
      assert.deepEqual(names(flags, "Trigger"), ["Eq"])
      assert.equal(get(kids(flags, "Trigger")[0], "script"), "-- Eq\n")
    })

    it("builds a JSON folder child as a group", () => {
      const [grp] = kids(kids(triggers, "Trigger")[0], "TriggerGroup")
      assert.equal(get(grp, "@isFolder"), "yes")
      assert.deepEqual(names(grp, "Trigger"), ["inner"])
    })

    it("writes children after the module's own fields", async() => {
      const xml = await readFile(path.join(dir, "build", "Nest.xml"), "utf8")
      assert.match(xml, /<name>Prompt<\/name>[\s\S]*?<\/regexCodePropertyList>\s*<Trigger /)
    })

    it("nests offset timers inside their timer", () => {
      assert.equal(timers.Timer.name, "Base")
      assert.equal(timers.Timer["@isFolder"], "no")
      assert.equal(timers.Timer.Timer.name, "Later")
      assert.equal(timers.Timer.Timer["@isOffsetTimer"], "yes")
    })

    it("unpacks nested modules back to children, scripts side by side", async() => {
      const [prompt] = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      assert.equal(prompt.name, "Prompt")
      assert.deepEqual(prompt.children.map(c => c.name), ["health", "flags", "Grp", "tail"])
      assert.deepEqual(prompt.children[1].children.map(c => c.name), ["Eq"])
      assert.equal(prompt.children[2].isFolder, "yes")
      assert.deepEqual(prompt.children[2].children.map(c => c.name), ["inner"])

      for(const name of ["Prompt", "health", "flags", "Eq", "inner", "tail"])
        assert.equal(await readFile(path.join(out, "src", "triggers", `${name}.lua`), "utf8"), `-- ${name}\n`)

      const [base] = await readJSON(path.join(out, "src", "timers", "timers.json"))
      assert.deepEqual(base.children.map(c => c.name), ["Later"])
    })

    it("rebuilds to the same triggers and timers", async() => {
      const rebuild = await build(out)
      assert.equal(rebuild.code, 0, `rebuild failed: ${rebuild.stderr}`)

      const section = (xml, tag) => xml.slice(xml.indexOf(`<${tag}>`), xml.indexOf(`</${tag}>`))
      const before = await readFile(path.join(dir, "build", "Nest.xml"), "utf8")
      const after = await readFile(path.join(out, "build", "Nest.xml"), "utf8")
      assert.equal(section(after, "TriggerPackage"), section(before, "TriggerPackage"))
      assert.equal(section(after, "TimerPackage"), section(before, "TimerPackage"))
    })
  })

  describe("name collisions", () => {
    // Every module must survive unpack and rebuild under muddy and muddler.
    // Same-named folders merge, as muddler merges them. A folder whose name
    // can't be a directory becomes a JSON folder entry with children. A leaf
    // whose .lua name is taken (case-insensitively) keeps its script inline.
    let out
    let unpacked
    let rebuilt
    let top

    const leaf = (name, script) => [
      "<Trigger isActive=\"yes\" isFolder=\"no\">",
      `<name>${name}</name><script>${script}</script><packageName/><mCommand/>`,
      "<regexCodeList><string>p</string></regexCodeList>",
      "<regexCodePropertyList><integer>0</integer></regexCodePropertyList>",
      "</Trigger>",
    ].join("")
    const group = (name, ...kids) => [
      "<TriggerGroup isActive=\"yes\" isFolder=\"yes\">",
      `<name>${name}</name><script/><packageName/><mCommand/>`,
      "<regexCodeList/><regexCodePropertyList/>",
      ...kids,
      "</TriggerGroup>",
    ].join("")
    const byName = (list, name) => list.find(e => e.name === name)

    before(async() => {
      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\"><TriggerPackage>",
        group("G", leaf("one", "-- one")),
        group("G", leaf("two", "-- two")),
        group("Combat/Healing", leaf("heal", "-- heal")),
        group("..", leaf("dots", "-- dots")),
        group("", leaf("anon", "-- anon")),
        leaf("a b", "-- ab1"),
        leaf("a_b", "-- ab2"),
        leaf("Foo", "-- F1"),
        leaf("foo", "-- F2"),
        leaf("x", "-- x"),
        group("x.lua", leaf("y", "-- y")),
        leaf("", "-- nameless"),
        leaf("c d", "-- cd"),
        leaf("c_d", ""),
        "</TriggerPackage></MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Col.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Col]]\nversion = [[1.0.0]]\n"))
      const mpackage = path.join(tmpDir, "Col.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "col-out")
      unpacked = await unpack(mpackage, out, "--no-helper")
      assert.equal(unpacked.code, 0, `unpack failed: ${unpacked.stderr}`)

      top = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      rebuilt = await build(out)
    })

    it("merges same-named sibling folders, with a warning", async() => {
      const g = await readJSON(path.join(out, "src", "triggers", "G", "triggers.json"))
      assert.deepEqual(g.map(e => e.name), ["one", "two"])
      assert.match(unpacked.stdout + unpacked.stderr, /'G'.*merged/)
    })

    it("keeps a folder whose name can't be a directory as a JSON folder", async() => {
      for(const [name, child] of [["Combat/Healing", "heal"], ["..", "dots"], ["", "anon"], ["x.lua", "y"]]) {
        const folder = byName(top, name)
        assert.ok(folder, `folder ${JSON.stringify(name)} should be a JSON entry`)
        assert.equal(folder.isFolder, "yes")
        assert.deepEqual(folder.children.map(c => c.name), [child])
      }

      assert.ok(!await exists(path.join(out, "src", "triggers", "Combat")))
    })

    it("gives the first leaf the .lua and inlines the script of any that collide", async() => {
      const lua = name => readFile(path.join(out, "src", "triggers", name), "utf8")

      assert.equal(await lua("a_b.lua"), "-- ab1")
      assert.equal(byName(top, "a b").script, undefined)
      assert.equal(byName(top, "a_b").script, "-- ab2")

      assert.equal(await lua("Foo.lua"), "-- F1")
      assert.equal(byName(top, "foo").script, "-- F2")

      assert.equal(await lua("x.lua"), "-- x")
      const nameless = top.find(e => e.name === "" && e.isFolder === "no")
      assert.equal(nameless.script, "-- nameless")
    })

    it("gives a colliding leaf with no script the .lua, moving the other inline", async() => {
      assert.equal(await readFile(path.join(out, "src", "triggers", "c_d.lua"), "utf8"), "")
      assert.equal(byName(top, "c d").script, "-- cd")
      assert.equal(byName(top, "c_d").script, undefined)
    })

    it("rebuilds every module with its own script", async() => {
      assert.equal(rebuilt.code, 0, `rebuild failed: ${rebuilt.stderr}`)

      const xml = await readFile(path.join(out, "build", "Col.xml"), "utf8")
      // An empty element serializes as `<name/>` / `<script/>`.
      const scripts = new Map(
        [...xml.matchAll(/<name(?:>([^<]*)<\/name>|\/>)\s*<script(?:>([^<]*)<\/script>|\/>)/g)]
          .filter(([, , script]) => script !== undefined)
          .map(([, name = "", script]) => [name, script])
      )

      for(const [name, script] of [
        ["one", "-- one"], ["two", "-- two"], ["heal", "-- heal"], ["dots", "-- dots"],
        ["anon", "-- anon"], ["a b", "-- ab1"], ["a_b", "-- ab2"], ["Foo", "-- F1"],
        ["foo", "-- F2"], ["x", "-- x"], ["y", "-- y"], ["", "-- nameless"], ["c d", "-- cd"],
      ])
        assert.equal(scripts.get(name), script, `script of ${JSON.stringify(name)}`)

      assert.match(xml, /<name>c_d<\/name>\s*<script\/>/)

      for(const name of ["G", "Combat/Healing", "..", "", "x.lua"]) {
        const tag = name
          ? `<name>${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}</name>`
          : "<name/>"
        assert.match(xml, new RegExp(`<TriggerGroup[^>]*>\\s*${tag}`), `group ${JSON.stringify(name)}`)
      }
    })
  })

  describe("quoted config.lua values", () => {
    // Mudlet runs config.lua as Lua, so a quoted string (with Lua escapes) is
    // as valid as a long bracket. Unpack must read every form the same way.
    let out
    let unpacked

    before(async() => {
      const config = [
        "mpackage = \"Quoted\"",
        "author = 'O\\'Neil'",
        "title = \"Say \\\"hi\\\"\\tnow\"",
        "description = \"two\\nlines, a \\\\ and \\65, caf\\195\\169\"",
        "version = [[1.2.3]]",
      ].join("\n") + "\n"

      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\"><ScriptPackage>",
        "<Script isActive=\"yes\" isFolder=\"no\"><name>S</name><script>x=1</script>",
        "<packageName/><eventHandlerList/></Script>",
        "</ScriptPackage></MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Quoted.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from(config))
      const mpackage = path.join(tmpDir, "Quoted.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "quoted-out")
      unpacked = await unpack(mpackage, out, "--no-helper")
      assert.equal(unpacked.code, 0, `unpack failed: ${unpacked.stderr}`)
    })

    it("reads quoted values into the mfile, escapes decoded", async() => {
      const mfile = await readJSON(path.join(out, "mfile"))
      assert.equal(mfile.package, "Quoted")
      assert.equal(mfile.author, "O'Neil")
      assert.equal(mfile.title, "Say \"hi\"\tnow")
      assert.equal(mfile.description, "two\nlines, a \\ and A, café")
      assert.equal(mfile.version, "1.2.3")
    })

    it("rebuilds under the package's own name", async() => {
      const b = await build(out)
      assert.equal(b.code, 0, `rebuild failed: ${b.stderr}`)
      assert.ok(await exists(path.join(out, "build", "Quoted.mpackage")))
    })
  })

  describe("mfile without package or version", () => {
    // A missing package falls back to the project directory's name and a
    // missing version to "", so muddy and muddler build the same package.
    let dir
    let built

    before(async() => {
      dir = path.join(tmpDir, "Fallback")
      await write(path.join(dir, "mfile"), JSON.stringify({author: "t"}, null, 2) + "\n")
      await write(path.join(dir, "src", "scripts", "scripts.json"), "[{\"name\":\"S\"}]\n")
      await write(path.join(dir, "src", "scripts", "S.lua"),
        "x = \"@PKGNAME@ v@VERSION@ | __PKGNAME__ v__VERSION__\"\n")

      built = await build(dir)
    })

    it("builds under the project directory's name, saying so", async() => {
      assert.equal(built.code, 0, `build failed: ${built.stderr}`)
      assert.ok(await exists(path.join(dir, "build", "Fallback.mpackage")))
      assert.match(built.stdout + built.stderr, /directory name/)
    })

    it("fills the tokens with the name and an empty version", async() => {
      const xml = await readFile(path.join(dir, "build", "Fallback.xml"), "utf8")
      assert.match(xml, /x = (&quot;|")Fallback v \| Fallback v(&quot;|")/)
      assert.doesNotMatch(xml, /undefined/)
    })

    it("writes the name to config.lua and leaves version out", () => {
      const zip = new AdmZip(path.join(dir, "build", "Fallback.mpackage"))
      const config = zip.readAsText("config.lua")
      assert.match(config, /^mpackage = \[\[Fallback\]\]$/m)
      assert.doesNotMatch(config, /^version\b/m)
    })
  })

  describe("mfile that isn't plain JSON", () => {
    // The mfile is plain JSON, as muddler reads it and `muddy version`
    // rewrites it, so the build rejects anything else with a clear error.
    let dir
    let built

    before(async() => {
      dir = path.join(tmpDir, "json5-src")
      await write(path.join(dir, "mfile"),
        "{\n  // a comment\n  package: \"J5\",\n  version: \"1.0.0\",\n}\n")
      await write(path.join(dir, "src", "scripts", "scripts.json"), "[{\"name\":\"S\"}]\n")
      await write(path.join(dir, "src", "scripts", "S.lua"), "x=1\n")

      built = await build(dir)
    })

    it("fails the build, naming the problem", async() => {
      assert.notEqual(built.code, 0)
      assert.match(built.stdout + built.stderr, /mfile is not valid JSON/)
      assert.ok(!await exists(path.join(dir, "build", "J5.mpackage")))
    })
  })

  describe("folder declared beside its directory", () => {
    // A folder entry in a JSON file that names a sibling directory declares
    // that directory's folder. As in muddler, the two build as one group: the
    // declared attributes win, and the directory's contents come first.
    let dir
    let built

    before(async() => {
      dir = path.join(tmpDir, "declared-src")
      await write(path.join(dir, "mfile"), JSON.stringify({
        package: "Decl", version: "1.0.0", author: "t",
      }, null, 2) + "\n")
      await write(path.join(dir, "src", "triggers", "triggers.json"), JSON.stringify([
        {name: "G", isFolder: "yes", isActive: "no", children: [{name: "fromJson"}]},
      ], null, 2) + "\n")
      await write(path.join(dir, "src", "triggers", "G.lua"), "-- group\n")
      await write(path.join(dir, "src", "triggers", "fromJson.lua"), "-- json\n")
      await write(path.join(dir, "src", "triggers", "G", "triggers.json"), "[{\"name\":\"fromDir\"}]\n")
      await write(path.join(dir, "src", "triggers", "G", "fromDir.lua"), "-- dir\n")

      built = await build(dir)
      assert.equal(built.code, 0, `build failed: ${built.stderr}`)
    })

    it("builds one group with the declared attributes and both sets of children", async() => {
      const xml = await readFile(path.join(dir, "build", "Decl.xml"), "utf8")
      assert.equal([...xml.matchAll(/<name>G<\/name>/g)].length, 1)
      assert.match(xml, /<TriggerGroup isActive="no" isFolder="yes"[^>]*>\s*<name>G<\/name>\s*<script>-- group\n<\/script>/)
      assert.match(xml, /<name>G<\/name>[\s\S]*<name>fromDir<\/name>[\s\S]*<name>fromJson<\/name>[\s\S]*<\/TriggerGroup>/)
    })
  })

  describe("disabled and scripted folders", () => {
    // A folder's own attributes (disabled, a group script) only survive the
    // round trip as a declaration beside its directory. A plain enabled folder
    // needs none, and a folder merged from a same-named sibling declares once.
    let out
    let source
    let rebuilt

    const leaf = name => [
      "<Trigger isActive=\"yes\" isFolder=\"no\">",
      `<name>${name}</name><script>-- ${name}</script><packageName/><mCommand/>`,
      "<regexCodeList><string>p</string></regexCodeList>",
      "<regexCodePropertyList><integer>0</integer></regexCodePropertyList>",
      "</Trigger>",
    ].join("")
    const group = (name, active, script, ...kids) => [
      `<TriggerGroup isActive="${active}" isFolder="yes">`,
      `<name>${name}</name><script>${script}</script><packageName/><mCommand/>`,
      "<regexCodeList/><regexCodePropertyList/>",
      ...kids,
      "</TriggerGroup>",
    ].join("")
    const groupTag = xml => [...xml.matchAll(/<TriggerGroup ([^>]*)>\s*<name>([^<]*)<\/name>\s*<script(?:>([^<]*)<\/script>|\/>)/g)]
      .map(([, attrs, name, script = ""]) => [name, /isActive="(\w+)"/.exec(attrs)[1], script])

    before(async() => {
      source = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\"><TriggerPackage>",
        group("Off", "no", "-- group", leaf("inside")),
        group("Outer", "yes", "", group("Inner", "no", "", leaf("deep"))),
        group("Dup", "no", "", leaf("one")),
        group("Dup", "yes", "", leaf("two")),
        "</TriggerPackage></MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Dis.xml", Buffer.from(source))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Dis]]\nversion = [[1.0.0]]\n"))
      const mpackage = path.join(tmpDir, "Dis.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "dis-out")
      const u = await unpack(mpackage, out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)

      rebuilt = await build(out)
    })

    it("declares a disabled or scripted folder beside its directory", async() => {
      const top = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      const off = top.find(e => e.name === "Off")
      assert.equal(off.isFolder, "yes")
      assert.equal(off.isActive, "no")
      assert.equal(off.children, undefined)
      assert.equal(await readFile(path.join(out, "src", "triggers", "Off.lua"), "utf8"), "-- group")

      const inner = await readJSON(path.join(out, "src", "triggers", "Outer", "triggers.json"))
      assert.deepEqual(inner.map(e => [e.name, e.isActive]), [["Inner", "no"]])
    })

    it("declares nothing for a plain enabled folder, and a merged folder once", async() => {
      const top = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      assert.deepEqual(top.map(e => e.name).sort(), ["Dup", "Off"])
    })

    it("rebuilds each folder with its own attributes", async() => {
      assert.equal(rebuilt.code, 0, `rebuild failed: ${rebuilt.stderr}`)

      const xml = await readFile(path.join(out, "build", "Dis.xml"), "utf8")
      assert.deepEqual(groupTag(xml).sort(), [
        ["Dup", "no", ""],
        ["Inner", "no", ""],
        ["Off", "no", "-- group"],
        ["Outer", "yes", ""],
      ])
      assert.match(xml, /<name>Dup<\/name>[\s\S]*<name>one<\/name>[\s\S]*<name>two<\/name>/)
    })
  })

  describe("folders with settings of their own", () => {
    // Any setting a bare directory wouldn't build with (here a trigger
    // group's pattern and command, an alias group's regex) is kept in a
    // folder entry beside the directory. A plain group needs no entry.
    let out
    let rebuilt

    before(async() => {
      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\">",
        "<TriggerPackage>",
        "<TriggerGroup isActive=\"yes\" isFolder=\"yes\"><name>Pat</name><script/><packageName/>",
        "<mCommand>cmd</mCommand>",
        "<regexCodeList><string>^x$</string></regexCodeList>",
        "<regexCodePropertyList><integer>1</integer></regexCodePropertyList>",
        "<Trigger isActive=\"yes\" isFolder=\"no\"><name>t</name><script>-- t</script><packageName/><mCommand/>",
        "<regexCodeList><string>p</string></regexCodeList>",
        "<regexCodePropertyList><integer>0</integer></regexCodePropertyList></Trigger>",
        "</TriggerGroup>",
        "<TriggerGroup isActive=\"yes\" isFolder=\"yes\"><name>Plain</name><script/><packageName/>",
        "<mCommand/><regexCodeList/><regexCodePropertyList/>",
        "<Trigger isActive=\"yes\" isFolder=\"no\"><name>u</name><script>-- u</script><packageName/><mCommand/>",
        "<regexCodeList><string>p</string></regexCodeList>",
        "<regexCodePropertyList><integer>0</integer></regexCodePropertyList></Trigger>",
        "</TriggerGroup>",
        "</TriggerPackage>",
        "<AliasPackage>",
        "<AliasGroup isActive=\"yes\" isFolder=\"yes\"><name>Ag</name><script/><packageName/>",
        "<command/><regex>^go$</regex>",
        "<Alias isActive=\"yes\" isFolder=\"no\"><name>a</name><script>-- a</script><packageName/>",
        "<command/><regex>^a$</regex></Alias>",
        "</AliasGroup>",
        "</AliasPackage>",
        "</MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Own.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Own]]\nversion = [[1.0.0]]\n"))
      const mpackage = path.join(tmpDir, "Own.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "own-out")
      const u = await unpack(mpackage, out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)

      rebuilt = await build(out)
    })

    it("keeps a folder entry only where the folder has settings", async() => {
      const triggers = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      assert.deepEqual(triggers.map(e => e.name), ["Pat"])
      assert.equal(triggers[0].isFolder, "yes")

      const aliases = await readJSON(path.join(out, "src", "aliases", "aliases.json"))
      assert.deepEqual(aliases.map(e => [e.name, e.regex]), [["Ag", "^go$"]])
    })

    it("rebuilds the groups with their settings", async() => {
      assert.equal(rebuilt.code, 0, `rebuild failed: ${rebuilt.stderr}`)

      const xml = await readFile(path.join(out, "build", "Own.xml"), "utf8")
      assert.match(xml, /<name>Pat<\/name>[\s\S]*?<mCommand>cmd<\/mCommand>[\s\S]*?<string>\^x\$<\/string>[\s\S]*?<integer>1<\/integer>/)
      assert.match(xml, /<AliasGroup[^>]*>\s*<name>Ag<\/name>[\s\S]*?<regex>\^go\$<\/regex>/)
      assert.match(xml, /<TriggerGroup[^>]*>\s*<name>Plain<\/name>/)
    })
  })

  describe("comments in config.lua", () => {
    // Mudlet runs config.lua as Lua, so commented-out assignments don't count,
    // while a `--` inside a string is just text.
    let out
    let unpacked

    before(async() => {
      const config = [
        "-- mpackage = [[Commented]]",
        "mpackage = [[Actual]]",
        "-- mpackage = [[Example]]",
        "title = \"has -- dashes\"",
        "--[==[",
        "title = [[Hidden]]",
        "]==]",
        "author = 'Real' -- a trailing comment",
        "--[[ version = [[9.9.9]] ]]",
        "version = [[1.0.0]]",
      ].join("\n") + "\n"

      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\"><ScriptPackage>",
        "<Script isActive=\"yes\" isFolder=\"no\"><name>S</name><script>x=1</script>",
        "<packageName/><eventHandlerList/></Script>",
        "</ScriptPackage></MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Actual.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from(config))
      const mpackage = path.join(tmpDir, "Commented.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "commented-out")
      unpacked = await unpack(mpackage, out, "--no-helper")
    })

    it("ignores commented-out assignments", async() => {
      assert.equal(unpacked.code, 0, `unpack failed: ${unpacked.stdout}${unpacked.stderr}`)

      const mfile = await readJSON(path.join(out, "mfile"))
      assert.equal(mfile.package, "Actual")
      assert.equal(mfile.title, "has -- dashes")
      assert.equal(mfile.author, "Real")
      assert.equal(mfile.version, "1.0.0")
    })
  })

  describe("settings of folders kept as JSON entries", () => {
    // A folder written as a JSON entry (nested in a chain, or with a name
    // that can't be a directory) keeps every setting, as a directory's
    // folder entry does.
    let out
    let rebuilt

    const leaf = name => [
      "<Trigger isActive=\"yes\" isFolder=\"no\">",
      `<name>${name}</name><script>-- ${name}</script><packageName/><mCommand/>`,
      "<regexCodeList><string>p</string></regexCodeList>",
      "<regexCodePropertyList><integer>0</integer></regexCodePropertyList>",
    ].join("")
    const group = (name, pattern, command, ...kids) => [
      "<TriggerGroup isActive=\"yes\" isFolder=\"yes\">",
      `<name>${name}</name><script/><packageName/><mCommand>${command}</mCommand>`,
      `<regexCodeList><string>${pattern}</string></regexCodeList>`,
      "<regexCodePropertyList><integer>1</integer></regexCodePropertyList>",
      ...kids,
      "</TriggerGroup>",
    ].join("")

    before(async() => {
      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE MudletPackage>",
        "<MudletPackage version=\"1.001\"><TriggerPackage>",
        leaf("Chain"), group("Sub", "^s$", "subcmd", leaf("leafy"), "</Trigger>"), "</Trigger>",
        group("A/B", "^ab$", "abcmd", leaf("inner"), "</Trigger>"),
        "</TriggerPackage></MudletPackage>",
      ].join("\n")

      const zip = new AdmZip()
      zip.addFile("Js.xml", Buffer.from(xml))
      zip.addFile("config.lua", Buffer.from("mpackage = [[Js]]\nversion = [[1.0.0]]\n"))
      const mpackage = path.join(tmpDir, "Js.mpackage")
      zip.writeZip(mpackage)

      out = path.join(tmpDir, "js-out")
      const u = await unpack(mpackage, out, "--no-helper")
      assert.equal(u.code, 0, `unpack failed: ${u.stderr}`)

      rebuilt = await build(out)
    })

    it("writes the folders' settings into their JSON entries", async() => {
      const top = await readJSON(path.join(out, "src", "triggers", "triggers.json"))
      const sub = top.find(e => e.name === "Chain").children[0]
      assert.equal(sub.name, "Sub")
      assert.deepEqual(sub.patterns, [{pattern: "^s$", type: "regex"}])

      const ab = top.find(e => e.name === "A/B")
      assert.deepEqual(ab.patterns, [{pattern: "^ab$", type: "regex"}])
    })

    it("rebuilds the folders with their settings", async() => {
      assert.equal(rebuilt.code, 0, `rebuild failed: ${rebuilt.stderr}`)

      const xml = await readFile(path.join(out, "build", "Js.xml"), "utf8")
      assert.match(xml, /<name>Sub<\/name>[\s\S]*?<mCommand>subcmd<\/mCommand>[\s\S]*?<string>\^s\$<\/string>/)
      assert.match(xml, /<name>A\/B<\/name>[\s\S]*?<mCommand>abcmd<\/mCommand>[\s\S]*?<string>\^ab\$<\/string>/)
    })
  })
})

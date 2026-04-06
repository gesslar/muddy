import {describe, it, before, after} from "node:test"
import assert from "node:assert/strict"
import {DirectoryObject, FileObject, Glog} from "@gesslar/toolkit"
import {mkdtempSync} from "node:fs"
import {rm} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import AdmZip from "adm-zip"

import Muddy from "../../src/Muddy.js"

/**
 * Creates a minimal muddy project in a temp directory.
 *
 * @param {object} [mfileOverrides] - Extra fields merged into mfile
 * @returns {Promise<DirectoryObject>} The project directory
 */
async function createProject(mfileOverrides = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "muddy-test-"))
  const projectDir = new DirectoryObject(tmp)

  // Write mfile
  const mfile = Object.assign({
    package: "TestPkg",
    title: "Test Package",
    description: "test",
    version: "1.0.0",
    author: "Test",
    icon: "",
    dependencies: "",
    outputFile: false,
  }, mfileOverrides)

  await projectDir.getFile("mfile").write(JSON.stringify(mfile))

  // Create src/scripts with two script groups: kept/ and ignored/
  const scriptsKept = projectDir
    .getDirectory("src")
    .getDirectory("scripts")
    .getDirectory("kept")
  await scriptsKept.assureExists({recursive: true})

  await scriptsKept.getFile("scripts.json").write(JSON.stringify([
    {isActive: "yes", isFolder: "no", name: "KeepMe", script: ""},
  ]))
  await scriptsKept.getFile("KeepMe.lua").write("-- kept")

  const scriptsIgnored = projectDir
    .getDirectory("src")
    .getDirectory("scripts")
    .getDirectory("drafts")
  await scriptsIgnored.assureExists({recursive: true})

  await scriptsIgnored.getFile("scripts.json").write(JSON.stringify([
    {isActive: "yes", isFolder: "no", name: "IgnoreMe", script: ""},
  ]))
  await scriptsIgnored.getFile("IgnoreMe.lua").write("-- ignored")

  // Create src/resources with two files: one kept and one ignored
  const resources = projectDir.getDirectory("src").getDirectory("resources")
  await resources.assureExists({recursive: true})
  await resources.getFile("keep.txt").write("kept resource")

  const resSubdir = resources.getDirectory("wip")
  await resSubdir.assureExists({recursive: true})
  await resSubdir.getFile("draft.txt").write("ignored resource")

  return projectDir
}

function silentGlog() {
  return new Glog()
    .withName("TEST")
    .noDisplayName()
}

describe("ignore", () => {
  let projectDir

  after(async() => {
    if(projectDir)
      await rm(projectDir.path, {recursive: true, force: true})
  })

  describe("without ignore patterns", () => {
    let mpackagePath

    before(async() => {
      projectDir = await createProject()
      await new Muddy().run(projectDir, silentGlog())
      mpackagePath = projectDir
        .getDirectory("build")
        .getFile("TestPkg.mpackage")
        .path
    })

    it("should include all scripts in the package", () => {
      const zip = new AdmZip(mpackagePath)
      const xml = zip.readAsText("TestPkg.xml")

      assert.ok(xml.includes("KeepMe"), "expected KeepMe in XML")
      assert.ok(xml.includes("IgnoreMe"), "expected IgnoreMe in XML")
    })

    it("should include all resource files in the package", () => {
      const zip = new AdmZip(mpackagePath)
      const entries = zip.getEntries().map(e => e.entryName)

      assert.ok(entries.includes("keep.txt"), "expected keep.txt")
      assert.ok(
        entries.some(e => e.includes("draft.txt")),
        "expected draft.txt"
      )
    })
  })

  describe("with ignore patterns", () => {
    let mpackagePath

    before(async() => {
      // Clean up previous project
      if(projectDir)
        await rm(projectDir.path, {recursive: true, force: true})

      projectDir = await createProject({
        ignore: ["**/drafts/**", "**/wip/**"],
      })
      await new Muddy().run(projectDir, silentGlog())
      mpackagePath = projectDir
        .getDirectory("build")
        .getFile("TestPkg.mpackage")
        .path
    })

    it("should include non-ignored scripts", () => {
      const zip = new AdmZip(mpackagePath)
      const xml = zip.readAsText("TestPkg.xml")

      assert.ok(xml.includes("KeepMe"), "expected KeepMe in XML")
    })

    it("should exclude ignored scripts", () => {
      const zip = new AdmZip(mpackagePath)
      const xml = zip.readAsText("TestPkg.xml")

      assert.ok(!xml.includes("IgnoreMe"), "IgnoreMe should be excluded")
    })

    it("should include non-ignored resources", () => {
      const zip = new AdmZip(mpackagePath)
      const entries = zip.getEntries().map(e => e.entryName)

      assert.ok(entries.includes("keep.txt"), "expected keep.txt")
    })

    it("should exclude ignored resources", () => {
      const zip = new AdmZip(mpackagePath)
      const entries = zip.getEntries().map(e => e.entryName)

      assert.ok(
        !entries.some(e => e.includes("draft.txt")),
        "draft.txt should be excluded"
      )
    })
  })

  describe("with empty ignore array", () => {
    let mpackagePath

    before(async() => {
      if(projectDir)
        await rm(projectDir.path, {recursive: true, force: true})

      projectDir = await createProject({ignore: []})
      await new Muddy().run(projectDir, silentGlog())
      mpackagePath = projectDir
        .getDirectory("build")
        .getFile("TestPkg.mpackage")
        .path
    })

    it("should include everything when ignore is empty", () => {
      const zip = new AdmZip(mpackagePath)
      const xml = zip.readAsText("TestPkg.xml")

      assert.ok(xml.includes("KeepMe"), "expected KeepMe")
      assert.ok(xml.includes("IgnoreMe"), "expected IgnoreMe")
    })
  })
})

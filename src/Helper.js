import c from "@gesslar/colours"
import {FileObject} from "@gesslar/toolkit"

import Lua from "./Lua.js"

/**
 * Type imports.
 *
 * @import {DirectoryObject} from "@gesslar/toolkit"
 */

/**
 * Emits the MuddyHelper.lua watcher script for a project.
 *
 * Shared by both `muddy unpack` (reconstructing a project from an mpackage) and
 * the project generator, so a freshly created or unpacked project ships with a
 * ready-to-use helper to drop into Mudlet.
 */
export default class Helper {
  /**
   * Writes a ready-to-use `<package>.MuddyHelper.lua` watcher script into the
   * project root, from the shipped template. Dropping it into Mudlet hot-reloads
   * the package on every rebuild — no hand-written helper required.
   *
   * @param {DirectoryObject} projectDirectory - The project root to write into
   * @param {string} packageName - The package name to wire the helper to
   * @param {object} glog - Logger instance for output
   * @returns {Promise<void>}
   */
  static async emit(projectDirectory, packageName, glog) {
    // Resolve the shipped template relative to this module (not the caller's
    // cwd). fromCwf() hands back the FileObject for this very file.
    const templateFile = FileObject.fromCwf()
      .parent
      .getDirectory("templates")
      .getFile("MuddyHelper.lua")
    const template = await templateFile.read()

    // A Lua-safe identifier for the global table name: non-word chars to
    // underscores, leading digits stripped (matches Generate's #luaSafe).
    const pkgId = packageName.replaceAll(/[^\w]/g, "_").replace(/^\d+/, "")

    // @PKGNAME@ is cosmetic (comments); @PKGID@ is a Lua identifier. The values
    // that land in Lua string positions (@NAME@, @PATH@) go through
    // Lua.longString so any character — including `]]` in a path — embeds safely.
    const content = template
      .replaceAll("@PKGNAME@", packageName)
      .replaceAll("@PKGID@", pkgId)
      .replaceAll("@NAME@", Lua.longString(packageName))
      .replaceAll("@PATH@", Lua.longString(projectDirectory.path))

    const helperFile = projectDirectory.getFile(`${packageName}.MuddyHelper.lua`)
    await helperFile.write(content)

    glog.success(c`Wrote {other}${helperFile.relativeTo(projectDirectory)}{/}`)
  }
}

import {Promised} from "@gesslar/toolkit"

/**
 * Type imports.
 *
 * @import {DirectoryObject} from "@gesslar/toolkit"
 */

/**
 * Static filesystem helpers shared across muddy.
 */
export default class Disk {
  /**
   * Recursively deletes a directory and its content.
   *
   * @param {DirectoryObject} dir - The directory to delete
   * @param {boolean} [includeSelf=false] - Whether to delete the directory itself
   * @returns {Promise<void>}
   */
  static async deleteRecursive(dir, includeSelf=false) {
    const {files, directories} = await dir.read()

    await Promised.settle(
      [files, directories].flat().map(async e => {
        if(e.isFile) {
          await e.delete()
        } else if(e.isDirectory) {
          await Disk.deleteRecursive(e)

          await e.delete()
        }
      })
    )

    includeSelf && await dir.delete()
  }
}

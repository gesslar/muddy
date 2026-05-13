import {DirectoryObject, Sass, Util, Valid} from "@gesslar/toolkit"

/**
 * Reads, bumps, and sets the SemVer in a project's mfile, in place.
 */
export default class Version {
  /**
   * Locate the mfile in the current working directory and pull its current
   * version. Throws if either the file or the version field is missing.
   *
   * @returns {Promise<{mfile: import("@gesslar/toolkit").FileObject, version: string}>}
   * @private
   */
  static async #loadMfile() {
    const cwd = DirectoryObject.fromCwd()
    const mfile = cwd.getFile("mfile")

    if(!await mfile.exists)
      throw Sass.new(`No such file ${mfile}`)

    const data = await mfile.loadData()
    const version = data?.version

    if(!version)
      throw Sass.new(`No SemVer information in ${mfile}`)

    return {mfile, version}
  }

  /**
   * Rewrite the "version" value in the mfile via regex, preserving the rest
   * of the file's formatting byte-for-byte.
   *
   * @param {import("@gesslar/toolkit").FileObject} mfile - The mfile to update.
   * @param {string} oldVersion - The current version (for the log message).
   * @param {string} newVersion - The version to write.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @returns {Promise<void>}
   * @private
   */
  static async #writeVersion(mfile, oldVersion, newVersion, glog) {
    const mfileRaw = await mfile.read()

    // Regex-replace rather than parse + re-emit, so the file's existing
    // formatting (quote style, spacing, key order, trailing commas) is preserved.
    const versionRegex = /("version"\s*:\s*)(["'])[^"'\n]*\2/

    Valid.assert(versionRegex.test(mfileRaw), `Could not locate "version" key in ${mfile}`)

    const newMfileRaw = mfileRaw.replace(versionRegex, `$1$2${newVersion}$2`)

    await mfile.write(newMfileRaw)

    glog.success(`${mfile} updated from ${oldVersion} => ${newVersion}`)
  }

  /**
   * Increment the SemVer in the current directory's mfile and write it back.
   *
   * @param {"major"|"minor"|"patch"} kind - Which component to bump.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @returns {Promise<void>}
   */
  static async increment(kind, glog) {
    const {mfile, version} = await this.#loadMfile()

    glog.info(`Found ${mfile}`)

    let {major, minor, patch} = Util.semver.basic.exec(version)?.groups ?? {}

    Valid.assert(Boolean(minor && major && patch), `Invalid SemVer format '${version}'`)

    if(kind === "patch") {
      patch = (Number(patch) + 1).toString()
    } else if(kind === "minor") {
      minor = (Number(minor) + 1).toString()
      patch = "0"
    } else if(kind === "major") {
      major = (Number(major) + 1).toString()
      minor = "0"
      patch = "0"
    }

    const newVersion = `${major}.${minor}.${patch}`

    await this.#writeVersion(mfile, version, newVersion, glog)
  }

  /**
   * Print the current SemVer from the mfile to stdout. Plain output (no log
   * prefix) so it's friendly to shell capture: VERSION=$(muddy version current)
   *
   * @returns {Promise<void>}
   */
  static async current() {
    const {version} = await this.#loadMfile()

    console.log(version)
  }

  /**
   * Set the mfile's version to an explicit SemVer.
   *
   * @param {string} newVersion - The SemVer to write (must be basic x.y.z form).
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @returns {Promise<void>}
   */
  static async set(newVersion, glog) {
    Valid.assert(Util.semver.basic.test(newVersion), `Invalid SemVer format '${newVersion}'`)

    const {mfile, version} = await this.#loadMfile()

    await this.#writeVersion(mfile, version, newVersion, glog)
  }
}

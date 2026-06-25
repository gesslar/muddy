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

    // The mfile is plain JSON. Parse it strictly here so anything that isn't
    // (JSON5 comments, YAML, trailing commas) is rejected with a clear error
    // instead of being silently tolerated by the read but choking the rewrite.
    let data

    try {
      data = JSON.parse(await mfile.read())
    } catch(error) {
      throw Sass.new(`${mfile} is not valid JSON: ${error.message}`)
    }

    const version = data?.version

    if(!version)
      throw Sass.new(`No SemVer information in ${mfile}`)

    return {mfile, version}
  }

  /**
   * Locate the value span of the *root-level* "version" field in raw JSON text.
   * Nesting depth is tracked across objects and arrays so a "version" buried
   * inside another structure (e.g. a config block in a package.json) is skipped
   * — only a direct child of the root object counts, regardless of where it sits
   * or whether a nested one shares its value. Strings are scanned with
   * backslash-escape awareness so quotes inside values don't derail the count.
   *
   * Callers validate the text with JSON.parse first, so the input is guaranteed
   * to be strict JSON — no comments to skip, no trailing-comma surprises.
   *
   * @param {string} raw - The file's raw text (already validated as JSON).
   * @returns {{start: number, end: number}|null} The [start, end) span of the
   *   value's inner text (between its quotes), or null if there is no
   *   root-level "version".
   * @private
   */
  static #locateRootVersion(raw) {
    const length = raw.length
    let depth = 0
    let i = 0

    while(i < length) {
      const ch = raw[i]

      if(ch === "{" || ch === "[") {
        depth++
        i++

        continue
      }

      if(ch === "}" || ch === "]") {
        depth--
        i++

        continue
      }

      if(ch !== "\"" && ch !== "'") {
        i++

        continue
      }

      // Read a complete string token, honouring backslash escapes.
      const quote = ch
      let token = ""

      i++

      while(i < length && raw[i] !== quote) {
        if(raw[i] === "\\") {
          token += raw[i + 1] ?? ""
          i += 2

          continue
        }

        token += raw[i]
        i++
      }

      i++ // step past the closing quote

      // Only a depth-1 "version" key — i.e. one followed by a colon — qualifies.
      if(depth !== 1 || token !== "version")
        continue

      let j = i

      while(j < length && /\s/.test(raw[j]))
        j++

      if(raw[j] !== ":")
        continue

      j++

      while(j < length && /\s/.test(raw[j]))
        j++

      const valueQuote = raw[j]

      if(valueQuote !== "\"" && valueQuote !== "'")
        return null

      const start = j + 1
      let k = start

      while(k < length && raw[k] !== valueQuote) {
        if(raw[k] === "\\") {
          k += 2

          continue
        }

        k++
      }

      return {start, end: k}
    }

    return null
  }

  /**
   * Swap the root-level "version" value in a file, preserving the rest of the
   * file's formatting (quote style, spacing, key order, trailing commas) and
   * leaving any nested "version" keys untouched.
   *
   * @param {import("@gesslar/toolkit").FileObject} file - The file to update.
   * @param {string} newVersion - The version to write.
   * @returns {Promise<string|null>} The previous version, or null if the file
   *   has no root-level "version" key (in which case nothing is written).
   * @private
   */
  static async #replaceVersion(file, newVersion) {
    const raw = await file.read()
    const span = Version.#locateRootVersion(raw)

    if(!span)
      return null

    const oldVersion = raw.slice(span.start, span.end)
    const updated = raw.slice(0, span.start) + newVersion + raw.slice(span.end)

    await file.write(updated)

    return oldVersion
  }

  /**
   * Rewrite the root-level "version" value in the mfile, preserving formatting.
   *
   * @param {import("@gesslar/toolkit").FileObject} mfile - The mfile to update.
   * @param {string} oldVersion - The current version (for the log message).
   * @param {string} newVersion - The version to write.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @returns {Promise<void>}
   * @private
   */
  static async #writeVersion(mfile, oldVersion, newVersion, glog) {
    const previous = await this.#replaceVersion(mfile, newVersion)

    Valid.assert(previous !== null, `Could not locate "version" key in ${mfile}`)

    glog.success(`${mfile} updated from ${oldVersion} => ${newVersion}`)
  }

  /**
   * Keep a sibling package.json's version in sync with the version just written
   * to the mfile. Missing file or missing "version" key is a warning, not an
   * error — the mfile is already updated, so we never abort here.
   *
   * @param {string} newVersion - The version that was written to the mfile.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @param {boolean} [warn] - Whether to emit warnings when there is nothing to
   *   sync (no package.json, invalid JSON, or no "version" key). Disabled by
   *   --no-warn.
   * @returns {Promise<void>}
   * @private
   */
  static async #syncPackage(newVersion, glog, warn = true) {
    const cwd = DirectoryObject.fromCwd()
    const pkg = cwd.getFile("package.json")

    if(!await pkg.exists) {
      if(warn)
        glog.warn(`--package was specified, but no package.json found in ${cwd}`)

      return
    }

    // package.json is plain JSON; validate before touching it so a malformed
    // file is reported rather than mis-edited.
    let data

    try {
      data = JSON.parse(await pkg.read())
    } catch {
      if(warn)
        glog.warn(`--package was specified, but ${pkg} is not valid JSON`)

      return
    }

    if(typeof data?.version !== "string") {
      if(warn)
        glog.warn(`--package was specified, but ${pkg} has no "version" key`)

      return
    }

    const previous = await this.#replaceVersion(pkg, newVersion)

    glog.success(`${pkg} updated from ${previous} => ${newVersion}`)
  }

  /**
   * Increment the SemVer in the current directory's mfile and write it back.
   *
   * @param {"major"|"minor"|"patch"} kind - Which component to bump.
   * @param {import("@gesslar/toolkit").Glog} glog - Logger instance.
   * @param {boolean} [syncPackage] - Also write the new version to a sibling
   *   package.json.
   * @param {boolean} [warn] - Emit a warning when --package finds nothing to
   *   sync. Disabled by --no-warn.
   * @returns {Promise<void>}
   */
  static async increment(kind, glog, syncPackage = false, warn = true) {
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

    if(syncPackage)
      await this.#syncPackage(newVersion, glog, warn)
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
   * @param {boolean} [syncPackage] - Also write the new version to a sibling
   *   package.json.
   * @param {boolean} [warn] - Emit a warning when --package finds nothing to
   *   sync. Disabled by --no-warn.
   * @returns {Promise<void>}
   */
  static async set(newVersion, glog, syncPackage = false, warn = true) {
    Valid.assert(Util.semver.basic.test(newVersion), `Invalid SemVer format '${newVersion}'`)

    const {mfile, version} = await this.#loadMfile()

    await this.#writeVersion(mfile, version, newVersion, glog)

    if(syncPackage)
      await this.#syncPackage(newVersion, glog, warn)
  }
}

const Mfile = new Object()

Mfile.FIELDS = Object.freeze([
  "package", "title", "description", "version", "author", "icon",
  "dependencies", "outputFile", "ignore",
])

Mfile.MFILE_TO_CONFIG = Object.freeze(new Map([
  ["package", "mpackage"],
  ["author", "author"],
  ["icon", "icon"],
  ["description", "description"],
  ["version", "version"],
  ["title", "title"],
]))

// Inverse of MFILE_TO_CONFIG (config.lua key -> mfile field), used when
// unpacking. Derived from the two constants above so there is a single source
// of truth: FIELDS supplies the order, MFILE_TO_CONFIG supplies the mapping.
Mfile.CONFIG_TO_MFILE = Object.freeze(new Map(
  Mfile.FIELDS
    .filter(field => Mfile.MFILE_TO_CONFIG.has(field))
    .map(field => [Mfile.MFILE_TO_CONFIG.get(field), field])
))

export default Mfile

const Mfile = new Object()

Mfile.FIELDS = Object.freeze([
  "package", "title", "description", "version", "author", "icon",
  "dependencies", "outputFile",
])

Mfile.MFILE_TO_CONFIG = Object.freeze(new Map([
  ["package", "mpackage"],
  ["author", "author"],
  ["icon", "icon"],
  ["description", "description"],
  ["version", "version"],
]))

export default Mfile

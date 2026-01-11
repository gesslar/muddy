import uglify from "@gesslar/uglier"

const files = ["{bin,src}/**/*.js"]

export default uglify({
  with: ["lints-js", "lints-jsdoc", "node"],
  overrides: {
    "lints-js": {files},
    "lints-jsdoc": {files},
    "node": {files}
  }
})

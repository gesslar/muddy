import uglify from "@gesslar/uglier"

export default uglify({
  // defaults to src/
  with: ["lints-js", "lints-jsdoc", "node"],
})

import {describe, it} from "node:test"
import assert from "node:assert/strict"
import Trigger, {PATTERN_TYPE_NAMES, PATTERN_TYPES} from "../../src/modules/Trigger.js"

/**
 * Builds a trigger from a single pattern of the given type and returns the
 * Mudlet code it was packed to.
 *
 * @param {string} type - Pattern type name.
 * @returns {number} The packed regexCodePropertyList code.
 */
function codeFor(type) {
  const trigger = new Trigger({
    name: "test",
    patterns: [{pattern: "x", type}],
  })

  return trigger.regexCodePropertyList[0]
}

describe("Trigger", () => {
  describe("pattern types", () => {
    it("should pack muddy's names to their Mudlet codes", () => {
      for(const [name, code] of Object.entries(PATTERN_TYPES)) {
        assert.equal(codeFor(name), code, name)
      }
    })

    // Regression: #94 — muddler's vocabulary failed the build.
    it("should accept muddler's names as aliases", () => {
      assert.equal(codeFor("startOfLine"), PATTERN_TYPES.begin)
      assert.equal(codeFor("exactMatch"), PATTERN_TYPES.exact)
      assert.equal(codeFor("colour"), PATTERN_TYPES.color)
    })

    it("should mark a colour pattern as a color trigger", () => {
      const trigger = new Trigger({
        name: "test",
        patterns: [{pattern: "x", type: "colour"}],
      })

      assert.equal(trigger.isColorTrigger, "yes")
    })

    it("should reject an unknown type by the name given", () => {
      assert.throws(
        () => codeFor("startOfLyne"),
        /Unknown pattern type 'startOfLyne'/
      )
    })

    it("should unpack codes to muddy's names", () => {
      assert.deepEqual(
        PATTERN_TYPE_NAMES,
        ["substring", "regex", "begin", "exact", "lua", "spacer", "color", "prompt"]
      )
    })
  })
})

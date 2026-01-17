import {describe, it} from "node:test"
import assert from "node:assert/strict"
import Type from "../../src/Type.js"

describe("Type", () => {
  describe("SINGLE", () => {
    it("should contain all single type names", () => {
      const expected = ["alias", "key", "script", "timer", "trigger"]
      assert.deepEqual(Type.SINGLE, expected)
    })

    it("should be frozen", () => {
      assert.ok(Object.isFrozen(Type.SINGLE))
    })
  })

  describe("PLURAL", () => {
    it("should contain all plural type names", () => {
      const expected = ["aliases", "keys", "scripts", "timers", "triggers"]
      assert.deepEqual(Type.PLURAL, expected)
    })

    it("should be frozen", () => {
      assert.ok(Object.isFrozen(Type.PLURAL))
    })
  })

  describe("TO_PLURAL", () => {
    it("should map singular to plural", () => {
      assert.equal(Type.TO_PLURAL.alias, "aliases")
      assert.equal(Type.TO_PLURAL.key, "keys")
      assert.equal(Type.TO_PLURAL.script, "scripts")
      assert.equal(Type.TO_PLURAL.timer, "timers")
      assert.equal(Type.TO_PLURAL.trigger, "triggers")
    })

    it("should be frozen", () => {
      assert.ok(Object.isFrozen(Type.TO_PLURAL))
    })
  })

  describe("TO_SINGLE", () => {
    it("should map plural to singular", () => {
      assert.equal(Type.TO_SINGLE.aliases, "alias")
      assert.equal(Type.TO_SINGLE.keys, "key")
      assert.equal(Type.TO_SINGLE.scripts, "script")
      assert.equal(Type.TO_SINGLE.timers, "timer")
      assert.equal(Type.TO_SINGLE.triggers, "trigger")
    })

    it("should be frozen", () => {
      assert.ok(Object.isFrozen(Type.TO_SINGLE))
    })
  })

  describe("CLASS", () => {
    it("should contain class constructors for each type", () => {
      assert.ok(Type.CLASS.aliases)
      assert.ok(Type.CLASS.keys)
      assert.ok(Type.CLASS.scripts)
      assert.ok(Type.CLASS.timers)
      assert.ok(Type.CLASS.triggers)
    })

    it("should be frozen", () => {
      assert.ok(Object.isFrozen(Type.CLASS))
    })
  })

  describe("TYPES", () => {
    it("should contain uppercase type names", () => {
      assert.ok(Type.TYPES.ALIAS)
      assert.ok(Type.TYPES.KEY)
      assert.ok(Type.TYPES.SCRIPT)
      assert.ok(Type.TYPES.TIMER)
      assert.ok(Type.TYPES.TRIGGER)
    })

    it("should be frozen", () => {
      assert.ok(Object.isFrozen(Type.TYPES))
    })
  })
})

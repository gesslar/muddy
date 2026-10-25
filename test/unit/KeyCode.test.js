import {describe, it} from "node:test"
import assert from "node:assert/strict"

import {
  KEY_ALIAS_LOOKUP,
  KEY_CODE_LOOKUP,
  KEY_CODE_NAMES,
  KEY_CODES,
  KEY_MODIFIERS,
} from "../../src/modules/KeyCode.js"

describe("KeyCode", () => {
  it("gives every key a code no other key shares", () => {
    const names = Object.keys(KEY_CODES)
    assert.equal(KEY_CODE_NAMES.size, names.length)
    assert.equal(KEY_CODE_LOOKUP.size, names.length)
  })

  it("maps every name to its code and back", () => {
    for(const [name, code] of Object.entries(KEY_CODES)) {
      assert.equal(KEY_CODE_LOOKUP.get(name.toUpperCase()), code, name)
      assert.equal(KEY_CODE_NAMES.get(code), name, name)
    }
  })

  it("keeps key names apart from modifier words", () => {
    for(const name of Object.keys(KEY_CODES))
      assert.equal(KEY_MODIFIERS[name.toUpperCase()], undefined, name)
  })

  it("resolves every alias to a known key", () => {
    for(const [alias, target] of KEY_ALIAS_LOOKUP)
      assert.ok(KEY_CODE_LOOKUP.has(target.toUpperCase()), alias)
  })

  it("names the keys Mudlet exports beyond the basics", () => {
    assert.equal(KEY_CODES.Clear, 0x0100000b)
    assert.equal(KEY_CODES.Menu, 0x01000055)
    assert.equal(KEY_CODES.Agrave, 0xc0)
    assert.equal(KEY_CODE_LOOKUP.get(KEY_ALIAS_LOOKUP.get("NBSP").toUpperCase()), 0xa0)
  })
})

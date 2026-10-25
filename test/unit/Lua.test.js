import {describe, it} from "node:test"
import assert from "node:assert/strict"

import Lua from "../../src/Lua.js"

describe("Lua", () => {
  describe("longString", () => {
    it("uses plain [[...]] when the value has no ]]", () => {
      assert.equal(Lua.longString("hello world"), "[[hello world]]")
    })

    it("bumps to [=[...]=] when the value contains ]]", () => {
      assert.equal(Lua.longString("See [[long]] strings"), "[=[See [[long]] strings]=]")
    })

    it("picks the lowest free level (a hole), not the max present", () => {
      // contains ]] and ]==] but not ]=] -> level 1 is free
      assert.equal(Lua.longString("a]]b]==]c"), "[=[a]]b]==]c]=]")
    })

    it("escalates only when every lower level is occupied", () => {
      // contains ]], ]=], ]==] -> must use level 3
      assert.equal(Lua.longString("x]]y]=]z]==]w"), "[===[x]]y]=]z]==]w]===]")
    })

    it("escalates when the value ends in ] so it can't fuse with the closer", () => {
      assert.equal(Lua.longString("Foo [beta]"), "[=[Foo [beta]]=]")
      assert.equal(Lua.longString("a]]x]="), "[==[a]]x]=]==]")
    })

    it("always closes exactly at the end of the value (total)", () => {
      for(const value of ["", "]", "]]", "]=]", "x]=", "]]]=]]==]", "}}]]==]===]"]) {
        const wrapped = Lua.longString(value)
        const eq = wrapped.match(/^\[(=*)\[/)[1]
        const body = wrapped.slice(eq.length + 2)
        assert.equal(body.indexOf(`]${eq}]`), value.length, `level ${eq.length} should close right after ${JSON.stringify(value)}`)
      }
    })
  })
})

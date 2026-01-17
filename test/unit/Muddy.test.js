import {describe, it, mock} from "node:test"
import assert from "node:assert/strict"
import Muddy from "../../src/Muddy.js"
import {DirectoryObject} from "@gesslar/toolkit"

describe("Muddy", () => {
  describe("constructor", () => {
    it("should create a new Muddy instance", () => {
      const muddy = new Muddy()
      assert.ok(muddy instanceof Muddy)
    })
  })

  describe("run", () => {
    it("should require a DirectoryObject parameter", async () => {
      const muddy = new Muddy()
      const mockLog = {
        error: mock.fn(),
        info: mock.fn(),
        table: mock.fn()
      }

      await assert.rejects(
        async () => {
          await muddy.run("not a directory object", mockLog)
        },
        {
          message: /DirectoryObject/
        }
      )
    })

    it("should require a Glog parameter", async () => {
      const muddy = new Muddy()
      const dir = new DirectoryObject(".")

      await assert.rejects(
        async () => {
          await muddy.run(dir, "not a glog")
        },
        {
          message: /Glog/
        }
      )
    })
  })
})

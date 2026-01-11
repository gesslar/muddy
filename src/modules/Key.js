import {Valid} from "@gesslar/toolkit"

import Module from "./Module.js"

export default class Key extends Module {
  #meta = new Map()

  constructor(object={}) {
    super(object)

    const {
      command="",
      keyCode=0,
      keyModifier=0
    } = object

    // Validate string fields
    Valid.type(command, "String")

    // Validate integer fields
    Valid.type(keyCode, "Number")
    Valid.type(keyModifier, "Number")

    // Store metadata
    this.#meta.set("command", command)
    this.#meta.set("keyCode", keyCode)
    this.#meta.set("keyModifier", keyModifier)
  }

  get command() {
    return this.#meta.get("command")
  }

  get keyCode() {
    return this.#meta.get("keyCode")
  }

  get keyModifier() {
    return this.#meta.get("keyModifier")
  }

  toJSON() {
    return Object.assign(
      super.toJSON(),
      {...Object.fromEntries(this.#meta)}
    )
  }

  toXMLFragment() {
    const frag = super.toXMLFragment()

    // Add elements in schema order (after name, packageName, script from Module)
    frag
      .last()
      .ele({command: this.command}).up()
      .ele({keyCode: this.keyCode}).up()
      .ele({keyModifier: this.keyModifier}).up()

    return frag
  }
}

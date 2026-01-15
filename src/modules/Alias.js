import {Valid} from "@gesslar/toolkit"

import MudletModule from "./MudletModule.js"

export default class Alias extends MudletModule {
  #meta = new Map()

  constructor(object={regex: "", command: ""}) {
    super(object)

    const {regex="", command=""} = object
    Valid.type(regex, "String")
    Valid.type(command, "String")

    this.#meta.set("regex", regex)
    this.#meta.set("command", command)
  }

  get regex() {
    return this.#meta.get("regex")
  }

  get command() {
    return this.#meta.get("command")
  }

  toJSON() {
    return Object.assign(
      super.toJSON(),
      {...Object.fromEntries(this.#meta)}
    )
  }

  toXMLFragment() {
    const frag = super.toXMLFragment()

    // Add elements in schema order (after name, script, packageName from Module)
    frag
      .last()
      .ele({command: this.command}).up()
      .ele({regex: this.regex}).up()

    return frag
  }
}

import {Valid} from "@gesslar/toolkit"

import Module from "./Module.js"

export default class Timer extends Module {
  #meta = new Map()

  constructor(object={}) {
    super(object)

    const {
      command="",
      time="00:00:00.000",
      isTempTimer="no",
      isOffsetTimer="no"
    } = object

    // Validate string fields
    Valid.type(command, "String")

    // Validate time format (hh:mm:ss.zzz)
    Valid.type(time, "String")
    const timePattern = /^[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$/
    Valid.assert(timePattern.test(time), "time must match format hh:mm:ss.zzz")

    // Validate yes/no attributes
    Valid.assert(isTempTimer === "yes" || isTempTimer === "no", "isTempTimer must be 'yes' or 'no'")
    Valid.assert(isOffsetTimer === "yes" || isOffsetTimer === "no", "isOffsetTimer must be 'yes' or 'no'")

    // Store metadata
    this.#meta.set("command", command)
    this.#meta.set("time", time)
    this.#meta.set("isTempTimer", isTempTimer)
    this.#meta.set("isOffsetTimer", isOffsetTimer)
  }

  get command() {
    return this.#meta.get("command")
  }

  get time() {
    return this.#meta.get("time")
  }

  get isTempTimer() {
    return this.#meta.get("isTempTimer")
  }

  get isOffsetTimer() {
    return this.#meta.get("isOffsetTimer")
  }

  toJSON() {
    return Object.assign(
      super.toJSON(),
      {...Object.fromEntries(this.#meta)}
    )
  }

  toXMLFragment() {
    const frag = super.toXMLFragment()

    // Add timer-specific attributes
    const root = frag.first()
    root.att("isTempTimer", this.isTempTimer)
    root.att("isOffsetTimer", this.isOffsetTimer)

    // Add elements in schema order (after name, script, packageName from Module)
    frag
      .last()
      .ele({command: this.command}).up()
      .ele({time: this.time}).up()

    return frag
  }
}

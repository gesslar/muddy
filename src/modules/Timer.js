import {Valid} from "@gesslar/toolkit"

import MudletModule from "./MudletModule.js"

const DEFAULT_TIME = "00:00:00.000"

export default class Timer extends MudletModule {
  #meta = new Map()

  constructor(object={}, glog) {
    super(object)

    Valid.type(glog, "Glog")

    const {
      command="",
      time=DEFAULT_TIME,
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

    // TimerGroup folders expose time/command/script fields in the Mudlet
    // UI but Mudlet does not fire any of them at runtime. Preserve
    // whatever the author provided in the XML (no silent rewriting)
    // but warn that Mudlet will not act on them.
    if(this.isFolder === "yes") {
      const inertFields = []

      if(time !== DEFAULT_TIME)
        inertFields.push("time")

      if(command !== "")
        inertFields.push("command")

      if(this.script !== "")
        inertFields.push("script")

      if(inertFields.length > 0) {
        glog.warn(
          `Timer '${this.name}' is a folder (TimerGroup) and sets `+
          `${inertFields.join(", ")} — Mudlet does not fire times, `+
          `commands, or scripts at the folder level. Consider moving `+
          `them to a child Timer.`
        )
      }
    }

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

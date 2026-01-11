import {Valid} from "@gesslar/toolkit"
import {fragment} from "xmlbuilder2"

export default class Variable {
  #meta = new Map()

  constructor(object={}) {
    const {
      name,
      keyType=0,
      value="",
      valueType=0,
      isActive="yes",
      isFolder="no"
    } = object

    // Validate required fields
    Valid.type(name, "String", {allowEmpty: false})
    Valid.type(value, "String")

    // Validate integer fields
    Valid.type(keyType, "Number")
    Valid.type(valueType, "Number")

    // Validate yes/no attributes
    Valid.assert(isActive === "yes" || isActive === "no", "isActive must be 'yes' or 'no'")
    Valid.assert(isFolder === "yes" || isFolder === "no", "isFolder must be 'yes' or 'no'")

    // Store metadata
    this.#meta.set("name", name)
    this.#meta.set("keyType", keyType)
    this.#meta.set("value", value)
    this.#meta.set("valueType", valueType)
    this.#meta.set("isActive", isActive)
    this.#meta.set("isFolder", isFolder)
  }

  get name() {
    return this.#meta.get("name")
  }

  get keyType() {
    return this.#meta.get("keyType")
  }

  get value() {
    return this.#meta.get("value")
  }

  get valueType() {
    return this.#meta.get("valueType")
  }

  get isActive() {
    return this.#meta.get("isActive")
  }

  get isFolder() {
    return this.#meta.get("isFolder")
  }

  toJSON() {
    return Object.fromEntries(this.#meta)
  }

  toString() {
    return `[Variable]`
  }

  toXMLFragment() {
    const frag = fragment()

    frag
      .ele("VariableGroup", {isActive: this.isActive, isFolder: this.isFolder})
      .ele({name: this.name}).up()
      .ele({keyType: this.keyType}).up()
      .ele({value: this.value}).up()
      .ele({valueType: this.valueType}).up()

    return frag
  }
}

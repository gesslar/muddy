import {Sass, Util, Valid} from "@gesslar/toolkit"
import {fragment} from "xmlbuilder2"

export default class MudletModule {
  #meta = new Map()

  constructor(object={}) {
    const {name, isFolder, isActive, packageName="", script=""} = (object ?? {})

    Valid.type(name, "String", {allowEmpty: false})
    Valid.assert(isFolder === "yes" || isFolder === "no", "isFolder must be 'yes' or 'no'.")
    Valid.assert(isActive === "yes" || isActive === "no", "isActive must be 'yes' or 'no'.")
    Valid.type(packageName, "String")
    Valid.type(script, "String")

    this.#meta.set("name", name)
    this.#meta.set("isFolder", isFolder)
    this.#meta.set("isActive", isActive)
    this.#meta.set("script", script)
    this.#meta.set("packageName", packageName) // i have no idea what this is used for
    this.#meta.set("parent", null)
    this.#meta.set("children", new Set())
    this.#meta.set("id", Symbol(name))
  }

  get name() {
    return this.#meta.get("name")
  }

  get id() {
    return this.#meta.get("id")
  }

  get isFolder() {
    return this.#meta.get("isFolder")
  }

  get isActive() {
    return this.#meta.get("isActive")
  }

  get script() {
    return this.#meta.get("script")
  }

  get packageName() {
    return this.#meta.get("packageName")
  }

  set parent(parent) {
    if(this.parent)
      throw Sass.new("Parent already set.")

    this.#meta.set("parent", parent)
  }

  get parent() {
    return this.#meta.get("parent")
  }

  addChild(child) {
    if(this.#meta.get("children").has(child))
      throw Sass.new(`Child '${child}' is already present.`)

    this.#meta.get("children").add(child)
    child.parent = this

    this.#meta.set("isFolder", "yes")

    return this
  }

  get children() {
    return this.#meta.get("children")
  }

  *parents() {
    let current = this.parent
    while(current !== null) {
      yield current
      current = current.parent
    }
  }

  toJSON() {
    return Object.fromEntries(this.#meta)
  }

  toString() {
    return `[${this.constructor.name}: ${this.name}]`
  }

  toXMLFragment() {
    const kind = this.constructor.name.toLowerCase()
    const baseName = Util.capitalize(kind)
    const tag = this.isFolder === "yes" ? `${baseName}Group` : baseName
    const frag = fragment()

    frag
      .ele(tag, {isActive: this.isActive, isFolder: this.isFolder})
      .ele({name: this.name}).up()
      .ele({script: this.script}).up()
      .ele({packageName: this.packageName}).up()

    return frag
  }
}

import {Sass, Util, Valid} from "@gesslar/toolkit"
import {fragment} from "xmlbuilder2"

/**
 * Base class for all Mudlet module types (scripts, triggers, aliases, etc.).
 */
export default class MudletModule {
  #meta = new Map()

  /**
   * Creates a new Mudlet module.
   *
   * @param {object} [object] - Configuration object
   * @param {string} object.name - Module name
   * @param {"yes" | "no"} object.isFolder - Whether this is a folder
   * @param {"yes" | "no"} object.isActive - Whether this module is active
   * @param {string} [object.packageName] - Package name
   * @param {string} [object.script] - Lua script content
   */
  constructor(object={}) {
    const {name, isFolder="no", isActive="yes", packageName="", script=""} = (object ?? {})

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

  /**
   * Gets the module name.
   *
   * @returns {string}
   */
  get name() {
    return this.#meta.get("name")
  }

  /**
   * Gets the module's unique symbol ID.
   *
   * @returns {symbol}
   */
  get id() {
    return this.#meta.get("id")
  }

  /**
   * Gets whether this module is a folder.
   *
   * @returns {"yes" | "no"}
   */
  get isFolder() {
    return this.#meta.get("isFolder")
  }

  /**
   * Gets whether this module is active.
   *
   * @returns {"yes" | "no"}
   */
  get isActive() {
    return this.#meta.get("isActive")
  }

  /**
   * Gets the Lua script content.
   *
   * @returns {string}
   */
  get script() {
    return this.#meta.get("script")
  }

  /**
   * Gets the package name.
   *
   * @returns {string}
   */
  get packageName() {
    return this.#meta.get("packageName")
  }

  /**
   * Sets the parent module.
   *
   * @param {MudletModule | null} parent - Parent module
   */
  set parent(parent) {
    if(this.parent)
      throw Sass.new("Parent already set.")

    this.#meta.set("parent", parent)
  }

  /**
   * Gets the parent module.
   *
   * @returns {MudletModule | null}
   */
  get parent() {
    return this.#meta.get("parent")
  }

  /**
   * Adds a child module to this module.
   *
   * @param {MudletModule} child - Child module to add
   * @returns {this}
   */
  addChild(child) {
    if(this.#meta.get("children").has(child))
      throw Sass.new(`Child '${child}' is already present.`)

    this.#meta.get("children").add(child)
    child.parent = this

    this.#meta.set("isFolder", "yes")

    return this
  }

  /**
   * Gets the set of child modules.
   *
   * @returns {Set<MudletModule>}
   */
  get children() {
    return this.#meta.get("children")
  }

  /**
   * Iterates through all parent modules up the hierarchy.
   *
   * @yields {MudletModule}
   */
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

  /**
   * Converts this module to an XML fragment for Mudlet package format.
   *
   * @returns {import("xmlbuilder2").XMLBuilder}
   */
  toXMLFragment() {
    const kind = this.constructor.name.toLowerCase()
    const baseName = Util.capitalize(kind)
    const tag = this.isFolder === "yes" ? `${baseName}Group` : baseName
    const frag = fragment()
    const children = this.children

    const root = frag
      .ele(tag, {isActive: this.isActive, isFolder: this.isFolder})
      .ele({name: this.name}).up()
      .ele({script: this.script}).up()
      .ele({packageName: this.packageName}).up()

    // If this is a folder, serialize its children as nested modules.
    if(this.isFolder === "yes" && children && children.size > 0) {
      for(const child of children)
        root.import(child.toXMLFragment())
    }

    return frag
  }
}

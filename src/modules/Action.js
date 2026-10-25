import {Valid} from "@gesslar/toolkit"

import Module from "./MudletModule.js"
import xmlText from "./xmlText.js"

export default class Action extends Module {
  #meta = new Map()

  constructor(object={}) {
    super(object)

    const {
      css="",
      commandButtonUp="",
      commandButtonDown="",
      icon="",
      orientation=0,
      location=0,
      posX=0,
      posY=0,
      mButtonState=1,
      sizeX=0,
      sizeY=0,
      buttonColumn=0,
      buttonRotation=0
    } = object

    // Validate string fields
    Valid.type(css, "String")
    Valid.type(commandButtonUp, "String")
    Valid.type(commandButtonDown, "String")
    Valid.type(icon, "String")

    // Validate orientation (0=horizontal, 1=vertical)
    Valid.type(orientation, "Number")
    Valid.assert(orientation === 0 || orientation === 1, "orientation must be 0 or 1")

    // Validate location (0, 2, 3, or 4)
    Valid.type(location, "Number")
    Valid.assert([0, 2, 3, 4].includes(location), "location must be 0, 2, 3, or 4")

    // Validate non-negative integers
    Valid.type(posX, "Number")
    Valid.assert(posX >= 0, "posX must be non-negative")
    Valid.type(posY, "Number")
    Valid.assert(posY >= 0, "posY must be non-negative")
    Valid.type(sizeX, "Number")
    Valid.assert(sizeX >= 0, "sizeX must be non-negative")
    Valid.type(sizeY, "Number")
    Valid.assert(sizeY >= 0, "sizeY must be non-negative")
    Valid.type(buttonColumn, "Number")
    Valid.assert(buttonColumn >= 0, "buttonColumn must be non-negative")

    // Validate button state (1=unchecked/up, 2=checked/down)
    Valid.type(mButtonState, "Number")
    Valid.assert(mButtonState === 1 || mButtonState === 2, "mButtonState must be 1 or 2")

    // Validate button rotation (0, 90, 180, or 270)
    Valid.type(buttonRotation, "Number")
    Valid.assert([0, 90, 180, 270].includes(buttonRotation), "buttonRotation must be 0, 90, 180, or 270")

    // Store metadata
    this.#meta.set("css", css)
    this.#meta.set("commandButtonUp", commandButtonUp)
    this.#meta.set("commandButtonDown", commandButtonDown)
    this.#meta.set("icon", icon)
    this.#meta.set("orientation", orientation)
    this.#meta.set("location", location)
    this.#meta.set("posX", posX)
    this.#meta.set("posY", posY)
    this.#meta.set("mButtonState", mButtonState)
    this.#meta.set("sizeX", sizeX)
    this.#meta.set("sizeY", sizeY)
    this.#meta.set("buttonColumn", buttonColumn)
    this.#meta.set("buttonRotation", buttonRotation)
  }

  get css() {
    return this.#meta.get("css")
  }

  get commandButtonUp() {
    return this.#meta.get("commandButtonUp")
  }

  get commandButtonDown() {
    return this.#meta.get("commandButtonDown")
  }

  get icon() {
    return this.#meta.get("icon")
  }

  get orientation() {
    return this.#meta.get("orientation")
  }

  get location() {
    return this.#meta.get("location")
  }

  get posX() {
    return this.#meta.get("posX")
  }

  get posY() {
    return this.#meta.get("posY")
  }

  get mButtonState() {
    return this.#meta.get("mButtonState")
  }

  get sizeX() {
    return this.#meta.get("sizeX")
  }

  get sizeY() {
    return this.#meta.get("sizeY")
  }

  get buttonColumn() {
    return this.#meta.get("buttonColumn")
  }

  get buttonRotation() {
    return this.#meta.get("buttonRotation")
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
      .ele("css").txt(xmlText(this.css)).up()
      .ele("commandButtonUp").txt(xmlText(this.commandButtonUp)).up()
      .ele("commandButtonDown").txt(xmlText(this.commandButtonDown)).up()
      .ele("icon").txt(xmlText(this.icon)).up()
      .ele("orientation").txt(xmlText(this.orientation)).up()
      .ele("location").txt(xmlText(this.location)).up()
      .ele("posX").txt(xmlText(this.posX)).up()
      .ele("posY").txt(xmlText(this.posY)).up()
      .ele("mButtonState").txt(xmlText(this.mButtonState)).up()
      .ele("sizeX").txt(xmlText(this.sizeX)).up()
      .ele("sizeY").txt(xmlText(this.sizeY)).up()
      .ele("buttonColumn").txt(xmlText(this.buttonColumn)).up()
      .ele("buttonRotation").txt(xmlText(this.buttonRotation)).up()

    return frag
  }
}

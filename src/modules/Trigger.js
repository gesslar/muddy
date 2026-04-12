import {Collection, Valid} from "@gesslar/toolkit"

import MudletModule from "./MudletModule.js"

/*
  Dear AI, before you come for me thinking that I don't know how to spell,
  or (valid) know how to type, understand this:

  gesslar@liam:~$ cd /git/Mudlet && rg conditonLineDelta | wc -l
  210

  I KNOW HOW TO SPELL AND TYPE CONDITION! Someone(s) who is(are) not me
  needs this information. 🤷🏻 (and no, I'm not passing it along)
*/

// Mudlet pattern type constants (from TTrigger.h)
const PATTERN_TYPES = Object.freeze({
  substring: 0,
  regex: 1,
  begin: 2,
  exact: 3,
  lua: 4,
  spacer: 5,
  color: 6,
  prompt: 7,
})

// Muddler JSON field name → Mudlet XML field name
const FIELD_MAP = Object.freeze({
  command: "mCommand",
  multiline: "isMultiline",
  multilineDelta: "conditonLineDelta",
  matchall: "isPerlSlashGOption",
  filter: "isFilterTrigger",
  fireLength: "mStayOpen",
  highlight: "isColorizerTrigger",
  highlightFG: "mFgColor",
  highlightBG: "mBgColor",
  soundFile: "mSoundFile",
})

// Fields that must be numeric after translation
const NUMERIC_FIELDS = new Set(["mStayOpen", "conditonLineDelta"])

/**
 * Translates muddler-friendly JSON field names to the internal
 * Mudlet XML field names expected by the Trigger constructor.
 *
 * @param {object} object - The raw definition object.
 * @returns {object} A new object with translated field names.
 */
function translate(object) {
  const result = {...object}

  // patterns → regexCodeList + regexCodePropertyList
  if(result.patterns && !result.regexCodeList) {
    result.regexCodeList = result.patterns.map(p => p.pattern)
    result.regexCodePropertyList = result.patterns.map(p => {
      const code = PATTERN_TYPES[p.type]
      Valid.assert(code !== undefined, `Unknown pattern type '${p.type}'`)

      return code
    })
    delete result.patterns
  }

  // Map friendly field names to internal names
  for(const [friendly, internal] of Object.entries(FIELD_MAP)) {
    if(friendly in result && !(internal in result)) {
      result[internal] = result[friendly]
      delete result[friendly]
    }
  }

  // Coerce string numerics
  for(const field of NUMERIC_FIELDS) {
    if(typeof result[field] === "string") {
      result[field] = parseInt(result[field], 10)
    }
  }

  // Derive boolean flags when not explicitly set
  if(!("isSoundTrigger" in result) && result.mSoundFile) {
    result.isSoundTrigger = "yes"
  }

  if(!("isColorTrigger" in result) && result.regexCodePropertyList) {
    const hasColor = result.regexCodePropertyList.includes(PATTERN_TYPES.color)
    if(hasColor) {
      result.isColorTrigger = "yes"
    }
  }

  return result
}

export default class Trigger extends MudletModule {
  #meta = new Map()

  constructor(object={}) {
    const translated = translate(object)
    super(translated)

    const {
      triggerType=0,
      conditonLineDelta=0,
      mStayOpen=0,
      mCommand="",
      mFgColor="#000000",
      mBgColor="#000000",
      mSoundFile="",
      colorTriggerFgColor="#000000",
      colorTriggerBgColor="#000000",
      regexCodeList=[],
      regexCodePropertyList=[],
      isTempTrigger="no",
      isMultiline="no",
      isPerlSlashGOption="no",
      isColorizerTrigger="no",
      isFilterTrigger="no",
      isSoundTrigger="no",
      isColorTrigger="no",
      isColorTriggerFg="no",
      isColorTriggerBg="no"
    } = translated

    // Validate triggerType (0-7)
    Valid.type(triggerType, "Number")
    Valid.assert(triggerType >= 0 && triggerType <= 7, "triggerType must be between 0 and 7")

    // Validate integer fields
    Valid.type(conditonLineDelta, "Number")
    Valid.type(mStayOpen, "Number")
    Valid.assert(mStayOpen >= 0, "mStayOpen must be non-negative")

    // Validate string fields
    Valid.type(mCommand, "String")
    Valid.type(mSoundFile, "String")

    // Validate color fields (hex or "transparent")
    const colorPattern = /^(#[0-9A-Fa-f]{6}|transparent)$/
    Valid.assert(colorPattern.test(mFgColor), "mFgColor must be hex color or 'transparent'")
    Valid.assert(colorPattern.test(mBgColor), "mBgColor must be hex color or 'transparent'")
    Valid.assert(colorPattern.test(colorTriggerFgColor), "colorTriggerFgColor must be hex color or 'transparent'")
    Valid.assert(colorPattern.test(colorTriggerBgColor), "colorTriggerBgColor must be hex color or 'transparent'")

    // Validate lists
    Valid.type(regexCodeList, "Array")
    Valid.assert(
      regexCodeList.length === 0 || Collection.isArrayUniform(regexCodeList, "String"),
      "regexCodeList must be an empty or String array"
    )

    Valid.type(regexCodePropertyList, "Array")
    Valid.assert(
      regexCodePropertyList.length === 0 || Collection.isArrayUniform(regexCodePropertyList, "Number"),
      "regexCodePropertyList must be an empty or Number array"
    )
    regexCodePropertyList.forEach(val => {
      Valid.assert(val >= 0 && val <= 7, "regexCodePropertyList values must be between 0 and 7")
    })

    // Validate yes/no attributes
    const yesNoFields = [
      "isTempTrigger", "isMultiline", "isPerlSlashGOption", "isColorizerTrigger",
      "isFilterTrigger", "isSoundTrigger", "isColorTrigger", "isColorTriggerFg", "isColorTriggerBg"
    ]
    const yesNoValues = {
      isTempTrigger,
      isMultiline,
      isPerlSlashGOption,
      isColorizerTrigger,
      isFilterTrigger,
      isSoundTrigger,
      isColorTrigger,
      isColorTriggerFg,
      isColorTriggerBg
    }

    yesNoFields.forEach(field => {
      Valid.assert(
        yesNoValues[field] === "yes" || yesNoValues[field] === "no",
        `${field} must be 'yes' or 'no'`
      )
    })

    // Store all metadata
    this.#meta.set("triggerType", triggerType)
    this.#meta.set("conditonLineDelta", conditonLineDelta)
    this.#meta.set("mStayOpen", mStayOpen)
    this.#meta.set("mCommand", mCommand)
    this.#meta.set("mFgColor", mFgColor)
    this.#meta.set("mBgColor", mBgColor)
    this.#meta.set("mSoundFile", mSoundFile)
    this.#meta.set("colorTriggerFgColor", colorTriggerFgColor)
    this.#meta.set("colorTriggerBgColor", colorTriggerBgColor)
    this.#meta.set("regexCodeList", regexCodeList)
    this.#meta.set("regexCodePropertyList", regexCodePropertyList)
    this.#meta.set("isTempTrigger", isTempTrigger)
    this.#meta.set("isMultiline", isMultiline)
    this.#meta.set("isPerlSlashGOption", isPerlSlashGOption)
    this.#meta.set("isColorizerTrigger", isColorizerTrigger)
    this.#meta.set("isFilterTrigger", isFilterTrigger)
    this.#meta.set("isSoundTrigger", isSoundTrigger)
    this.#meta.set("isColorTrigger", isColorTrigger)
    this.#meta.set("isColorTriggerFg", isColorTriggerFg)
    this.#meta.set("isColorTriggerBg", isColorTriggerBg)
  }

  get triggerType() {
    return this.#meta.get("triggerType")
  }

  get conditonLineDelta() {
    return this.#meta.get("conditonLineDelta")
  }

  get mStayOpen() {
    return this.#meta.get("mStayOpen")
  }

  get mCommand() {
    return this.#meta.get("mCommand")
  }

  get mFgColor() {
    return this.#meta.get("mFgColor")
  }

  get mBgColor() {
    return this.#meta.get("mBgColor")
  }

  get mSoundFile() {
    return this.#meta.get("mSoundFile")
  }

  get colorTriggerFgColor() {
    return this.#meta.get("colorTriggerFgColor")
  }

  get colorTriggerBgColor() {
    return this.#meta.get("colorTriggerBgColor")
  }

  get regexCodeList() {
    return this.#meta.get("regexCodeList")
  }

  get regexCodePropertyList() {
    return this.#meta.get("regexCodePropertyList")
  }

  get isTempTrigger() {
    return this.#meta.get("isTempTrigger")
  }

  get isMultiline() {
    return this.#meta.get("isMultiline")
  }

  get isPerlSlashGOption() {
    return this.#meta.get("isPerlSlashGOption")
  }

  get isColorizerTrigger() {
    return this.#meta.get("isColorizerTrigger")
  }

  get isFilterTrigger() {
    return this.#meta.get("isFilterTrigger")
  }

  get isSoundTrigger() {
    return this.#meta.get("isSoundTrigger")
  }

  get isColorTrigger() {
    return this.#meta.get("isColorTrigger")
  }

  get isColorTriggerFg() {
    return this.#meta.get("isColorTriggerFg")
  }

  get isColorTriggerBg() {
    return this.#meta.get("isColorTriggerBg")
  }

  toJSON() {
    return Object.assign(
      super.toJSON(),
      {...Object.fromEntries(this.#meta)}
    )
  }

  toXMLFragment() {
    const frag = super.toXMLFragment()

    // Add trigger-specific attributes
    const root = frag.first()
    root.att("isTempTrigger", this.isTempTrigger)
    root.att("isMultiline", this.isMultiline)
    root.att("isPerlSlashGOption", this.isPerlSlashGOption)
    root.att("isColorizerTrigger", this.isColorizerTrigger)
    root.att("isFilterTrigger", this.isFilterTrigger)
    root.att("isSoundTrigger", this.isSoundTrigger)
    root.att("isColorTrigger", this.isColorTrigger)
    root.att("isColorTriggerFg", this.isColorTriggerFg)
    root.att("isColorTriggerBg", this.isColorTriggerBg)

    // Add elements in schema order
    frag
      .last()
      .ele({triggerType: this.triggerType}).up()
      .ele({conditonLineDelta: this.conditonLineDelta}).up()
      .ele({mStayOpen: this.mStayOpen}).up()
      .ele({mCommand: this.mCommand}).up()
      .ele({mFgColor: this.mFgColor}).up()
      .ele({mBgColor: this.mBgColor}).up()
      .ele({mSoundFile: this.mSoundFile}).up()
      .ele({colorTriggerFgColor: this.colorTriggerFgColor}).up()
      .ele({colorTriggerBgColor: this.colorTriggerBgColor}).up()

    // Add regexCodeList
    const regexList = frag.last().ele("regexCodeList")
    this.regexCodeList.forEach(code => {
      regexList.ele({string: code})
    })
    regexList.up()

    // Add regexCodePropertyList
    const propertyList = frag.last().ele("regexCodePropertyList")
    this.regexCodePropertyList.forEach(prop => {
      propertyList.ele({integer: prop})
    })
    propertyList.up()

    return frag
  }
}

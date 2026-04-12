import {Valid} from "@gesslar/toolkit"

import {
  KEY_ALIAS_LOOKUP,
  KEY_CODE_LOOKUP,
  KEY_MODIFIERS,
} from "./KeyCode.js"
import MudletModule from "./MudletModule.js"

/**
 * @import {Glog} from "@gesslar/toolkit"
 */

/**
 * Parses a chord string like "Ctrl+Shift+R" into its Qt key code and
 * modifier bitmask. Tokens are split on '+', categorised as modifier or
 * key, and the resulting modifier bits are OR'd together.
 *
 * Unknown tokens, a missing key, or a chord with more than one key
 * emit a warning via the supplied Glog instance but do not throw — the
 * resulting Mudlet package will still build, just with an obviously
 * broken binding that the author can fix.
 *
 * @param {string} chord - The raw chord string (e.g. "Ctrl+R")
 * @param {string} ownerName - Name of the owning Key, for diagnostics
 * @param {Glog} glog - Logger instance for diagnostic output
 * @returns {{keyCode: number, keyModifier: number}}
 */
const parseKeys = (chord, ownerName, glog) => {
  const trimmed = chord.trim()

  if(trimmed === "") {
    glog.warn(
      `Key '${ownerName}' has no 'keys' chord — Mudlet will load it but `+
      `the binding will never fire.`
    )

    return {keyCode: 0, keyModifier: 0}
  }

  // Split on '+' but keep a literal trailing '+' as a key token:
  // "Ctrl++" means Ctrl + Plus, and a bare "+" is just Plus. We detect
  // both by checking whether the chord ends with a '+' preceded by
  // another '+' or nothing (so normal separators don't get eaten).
  const isBarePlus = trimmed === "+"
  const endsWithPlusKey = isBarePlus || /\+\+$/.test(trimmed)
  const body = isBarePlus ? "" : endsWithPlusKey ? trimmed.slice(0, -2) : trimmed
  const rawTokens = body.split("+").map(t => t.trim()).filter(Boolean)

  if(endsWithPlusKey)
    rawTokens.push("+")

  let keyCode = 0
  let keyToken = null
  let keyModifier = 0

  for(const token of rawTokens) {
    const upper = token.toUpperCase()
    const modBit = KEY_MODIFIERS[upper]

    if(modBit !== undefined) {
      keyModifier |= modBit
      continue
    }

    if(keyToken !== null) {
      glog.warn(
        `Key '${ownerName}' chord '${chord}' has more than one non-modifier `+
        `token ('${keyToken}' and '${token}') — Mudlet only binds one key `+
        `per chord. Keeping '${keyToken}'.`
      )

      continue
    }

    const aliased = KEY_ALIAS_LOOKUP.get(upper) ?? token
    const code = KEY_CODE_LOOKUP.get(aliased.toUpperCase())

    if(code === undefined) {
      glog.warn(
        `Key '${ownerName}' chord '${chord}' has unknown key token `+
        `'${token}' — Mudlet will not recognise the binding.`
      )

      continue
    }

    keyToken = token
    keyCode = code
  }

  if(keyToken === null) {
    glog.warn(
      `Key '${ownerName}' chord '${chord}' has modifiers but no key — `+
      `Mudlet will not recognise the binding.`
    )
  }

  return {keyCode, keyModifier}
}

export default class Key extends MudletModule {
  #meta = new Map()

  /**
   * Creates a new Key binding.
   *
   * @param {object} [object] - Configuration object
   * @param {string} [object.keys] - The chord, e.g. "Ctrl+R" or "Shift+F5".
   *   Parsed into Qt keyCode and keyModifier internally. Modifier
   *   synonyms are accepted (Ctrl/Control, Cmd/Command/Meta/Win/Super,
   *   Alt/Opt/Option).
   * @param {string} [object.command] - Literal command to send when the
   *   key fires (only used when `script` is empty).
   * @param {Glog} glog - Logger instance used for chord diagnostics
   */
  constructor(object={}, glog) {
    super(object)

    Valid.type(glog, "Glog")

    const {command="", keys=""} = object

    Valid.type(command, "String")
    Valid.type(keys, "String")

    const {keyCode, keyModifier} = parseKeys(keys, this.name, glog)

    this.#meta.set("command", command)
    this.#meta.set("keys", keys)
    this.#meta.set("keyCode", keyCode)
    this.#meta.set("keyModifier", keyModifier)
  }

  get command() {
    return this.#meta.get("command")
  }

  get keys() {
    return this.#meta.get("keys")
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

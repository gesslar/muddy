import {Collection, Valid} from "@gesslar/toolkit"

import MudletModule from "./MudletModule.js"

/**
 * Script module - represents a Lua script in Mudlet with optional event handlers.
 */
export default class Script extends MudletModule {
  #meta = new Map()

  /**
   * Creates a new Script module.
   *
   * @param {object} [object] - Configuration object
   * @param {Array<string>} [object.eventHandlerList] - List of event handler names
   */
  constructor(object={}) {
    super(object)

    const {eventHandlerList=[]} = object

    Valid.type(eventHandlerList, "Array")
    Valid.assert(
      eventHandlerList.length === 0 ||
      Collection.isArrayUniform(eventHandlerList, "String"),
      "eventHandlerList must be an empty or String array"
    )

    this.#meta.set("eventHandlerList", eventHandlerList)
  }

  /**
   * Gets the list of event handler names.
   *
   * @returns {Array<string>} List of event handler names
   */
  get eventHandlerList() {
    return this.#meta.get("eventHandlerList")
  }

  toJSON() {
    return Object.assign(
      super.toJSON(),
      {...Object.fromEntries(this.#meta)}
    )
  }

  toXMLFragment() {
    const frag = super.toXMLFragment()

    // Add eventHandlerList as a container with string children
    const handlerList = frag.last().ele("eventHandlerList")
    this.eventHandlerList.forEach(handler => handlerList.ele({string: handler}))

    handlerList.up()

    return frag
  }
}

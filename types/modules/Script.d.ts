/**
 * Script module - represents a Lua script in Mudlet with optional event handlers.
 */
export default class Script extends MudletModule {
    /**
     * Creates a new Script module.
     *
     * @param {object} [object] - Configuration object
     * @param {Array<string>} [object.eventHandlerList] - List of event handler names
     */
    constructor(object?: {
        eventHandlerList?: Array<string>;
    });
    /**
     * Gets the list of event handler names.
     *
     * @returns {Array<string>} List of event handler names
     */
    get eventHandlerList(): Array<string>;
    #private;
}
import MudletModule from "./MudletModule.js";
//# sourceMappingURL=Script.d.ts.map
import MudletModule from "./MudletModule.js";
export default class Key extends MudletModule {
    #private;
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
     * @param {object} glog - Logger instance used for chord diagnostics
     */
    constructor(object?: {
        keys?: string;
        command?: string;
    }, glog: object);
    get command(): any;
    get keys(): any;
    get keyCode(): any;
    get keyModifier(): any;
    toJSON(): any;
    fieldsXMLFragment(): any;
}
//# sourceMappingURL=Key.d.ts.map
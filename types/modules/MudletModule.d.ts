/**
 * Base class for all Mudlet module types (scripts, triggers, aliases, etc.).
 */
export default class MudletModule {
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
    constructor(object?: {
        name: string;
        isFolder: "yes" | "no";
        isActive: "yes" | "no";
        packageName?: string;
        script?: string;
    });
    /**
     * Gets the module name.
     *
     * @returns {string}
     */
    get name(): string;
    /**
     * Gets the module's unique symbol ID.
     *
     * @returns {symbol}
     */
    get id(): symbol;
    /**
     * Gets whether this module is a folder.
     *
     * @returns {"yes" | "no"}
     */
    get isFolder(): "yes" | "no";
    /**
     * Gets whether this module is active.
     *
     * @returns {"yes" | "no"}
     */
    get isActive(): "yes" | "no";
    /**
     * Gets the Lua script content.
     *
     * @returns {string}
     */
    get script(): string;
    /**
     * Gets the package name.
     *
     * @returns {string}
     */
    get packageName(): string;
    /**
     * Sets the parent module.
     *
     * @param {MudletModule | null} parent - Parent module
     */
    set parent(parent: MudletModule | null);
    /**
     * Gets the parent module.
     *
     * @returns {MudletModule | null}
     */
    get parent(): MudletModule | null;
    /**
     * Adds a child module to this module.
     *
     * @param {MudletModule} child - Child module to add
     * @returns {this}
     */
    addChild(child: MudletModule): this;
    /**
     * Gets the set of child modules.
     *
     * @returns {Set<MudletModule>}
     */
    get children(): Set<MudletModule>;
    /**
     * Iterates through all parent modules up the hierarchy.
     *
     * @yields {MudletModule}
     */
    parents(): Generator<MudletModule, void, unknown>;
    toJSON(): any;
    toString(): string;
    /**
     * Converts this module to an XML fragment for Mudlet package format.
     *
     * @returns {import("xmlbuilder2").XMLBuilder}
     */
    toXMLFragment(): import("xmlbuilder2").XMLBuilder;
    #private;
}
//# sourceMappingURL=MudletModule.d.ts.map
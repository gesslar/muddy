import { URL } from "node:url";
/**
 * Sealed Type object containing all module type constants and mappings.
 */
declare const _default: {
    /**
     * Array of singular module type names.
     *
     * @type {Array<string>}
     */
    SINGLE: Array<string>;
    /**
     * Array of plural module type names.
     *
     * @type {Array<string>}
     */
    PLURAL: Array<string>;
    /**
     * Mapping from singular to plural module type names.
     *
     * @type {Readonly<Record<string, string>>}
     */
    TO_PLURAL: Readonly<Record<string, string>>;
    /**
     * Mapping from plural to singular module type names.
     *
     * @type {Readonly<Record<string, string>>}
     */
    TO_SINGLE: Readonly<Record<string, string>>;
    /**
     * Mapping from plural module type names to their class constructors.
     *
     * @type {Readonly<Record<string, Function>>}
     */
    CLASS: Readonly<Record<string, Function>>;
    /**
     * Mapping from uppercase type names to plural module type names.
     *
     * @type {Readonly<Record<string, string>>}
     */
    TYPES: Readonly<Record<string, string>>;
    /**
     * Mapping from plural module type names to their JSON file names.
     *
     * @type {Readonly<Record<string, string>>}
     */
    FILES: Readonly<Record<string, string>>;
    /**
     * Mapping from type names to their schema URLs.
     *
     * @type {Readonly<Record<string, URL>>}
     */
    URL: Readonly<Record<string, URL>>;
    /**
     * Mapping from plural module type names to their XML package tag names.
     *
     * @type {Readonly<Record<string, string>>}
     */
    PACKAGES: Readonly<Record<string, string>>;
};
export default _default;
//# sourceMappingURL=Type.d.ts.map
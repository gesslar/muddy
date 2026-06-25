/**
 * Static helpers for emitting Lua source.
 */
export default class Lua {
    /**
     * Wraps a value as a Lua long-bracket string, choosing the lowest bracket
     * level whose closing delimiter does not occur in the value. This lets
     * arbitrary text — including `]]`, `]=]`, etc. — embed without terminating the
     * string early or producing invalid Lua. Values free of `]]` get plain
     * `[[...]]`, unchanged.
     *
     * @param {string} value - The raw value to wrap
     * @returns {string} The value wrapped as `[[...]]` / `[=[...]=]` / ...
     */
    static longString(value: string): string;
}
//# sourceMappingURL=Lua.d.ts.map
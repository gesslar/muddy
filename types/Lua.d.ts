/**
 * Static helpers for emitting Lua source.
 */
export default class Lua {
    /**
     * Derives the base `.lua` filename (without extension) muddy uses for a
     * module name. Whitespace collapses to underscores — the muddler convention
     * the build's script lookup relies on — and the result is then run through
     * {@link FileSystem.sanitize}, so a name carrying characters that are illegal
     * in a filename (e.g. `/`, `:`, `*`, a reserved device name) still yields a
     * file that writes on every OS.
     *
     * The build (which reads a script's `.lua` by computed name) and unpack
     * (which writes it) share this single transform so a module round-trips by
     * name. A name that reduces to nothing returns `""`; callers append the
     * `.lua` extension themselves.
     *
     * @param {string} name - The module name
     * @returns {string} The sanitized base filename, or "" when the name reduces to nothing
     */
    static fileName(name: string): string;
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
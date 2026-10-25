/**
 * Prepares a value to be written as element text with xmlbuilder2's `.txt()`.
 *
 * xmlbuilder2 won't write arbitrary text verbatim. Object-form `.ele({tag: v})`
 * decodes `&amp;`/`&#n;` in the value first, and its serializer leaves anything
 * shaped like an entity (`&nbsp;`) unescaped. Lua full of HTML entities then
 * reaches Mudlet altered, or as undefined entities that cut the script off
 * (#88). Escaping every `&` up front and passing the result to `.txt()` skips
 * the decode, and the serializer keeps the `&amp;` as is.
 *
 * @param {unknown} value - The text content.
 * @returns {string} The value with every `&` escaped.
 */
export default function xmlText(value: unknown): string;
//# sourceMappingURL=xmlText.d.ts.map
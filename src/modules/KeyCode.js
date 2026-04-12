/**
 * Qt::Key values. The key names here match what `QKeySequence::toString()`
 * (and therefore the Mudlet "grab key" button) prints, so users can copy
 * what they see in Mudlet directly.
 */
export const KEY_CODES = Object.freeze({
  // Letters
  A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73,
  J: 74, K: 75, L: 76, M: 77, N: 78, O: 79, P: 80, Q: 81, R: 82,
  S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,

  // Digits
  0: 48, 1: 49, 2: 50, 3: 51, 4: 52,
  5: 53, 6: 54, 7: 55, 8: 56, 9: 57,

  // Whitespace / editing
  Space: 32,
  Escape: 0x01000000,
  Tab: 0x01000001,
  Backtab: 0x01000002,
  Backspace: 0x01000003,
  Return: 0x01000004,
  Enter: 0x01000005,
  Insert: 0x01000006,
  Delete: 0x01000007,
  Pause: 0x01000008,
  Print: 0x01000009,

  // Navigation
  Home: 0x01000010,
  End: 0x01000011,
  Left: 0x01000012,
  Up: 0x01000013,
  Right: 0x01000014,
  Down: 0x01000015,
  PageUp: 0x01000016,
  PageDown: 0x01000017,

  // Function keys
  F1: 0x01000030, F2: 0x01000031, F3: 0x01000032, F4: 0x01000033,
  F5: 0x01000034, F6: 0x01000035, F7: 0x01000036, F8: 0x01000037,
  F9: 0x01000038, F10: 0x01000039, F11: 0x0100003a, F12: 0x0100003b,
  F13: 0x0100003c, F14: 0x0100003d, F15: 0x0100003e, F16: 0x0100003f,
  F17: 0x01000040, F18: 0x01000041, F19: 0x01000042, F20: 0x01000043,
  F21: 0x01000044, F22: 0x01000045, F23: 0x01000046, F24: 0x01000047,

  // Punctuation (Qt names)
  Exclam: 33, QuoteDbl: 34, NumberSign: 35, Dollar: 36, Percent: 37,
  Ampersand: 38, Apostrophe: 39, ParenLeft: 40, ParenRight: 41,
  Asterisk: 42, Plus: 43, Comma: 44, Minus: 45, Period: 46, Slash: 47,
  Colon: 58, Semicolon: 59, Less: 60, Equal: 61, Greater: 62,
  Question: 63, At: 64, BracketLeft: 91, Backslash: 92, BracketRight: 93,
  AsciiCircum: 94, Underscore: 95, QuoteLeft: 96, BraceLeft: 123,
  Bar: 124, BraceRight: 125, AsciiTilde: 126,
})

/**
 * Friendly aliases + typed-symbol shortcuts that resolve to a canonical
 * Qt::Key name. Lookup is case-insensitive so "esc", "Esc", "ESCAPE" and
 * "Escape" all land on the same bucket.
 */
export const KEY_ALIASES = Object.freeze({
  ESC: "Escape",
  RETURN: "Return",
  ENTER: "Enter",
  BKSP: "Backspace",
  DEL: "Delete",
  INS: "Insert",
  SPC: "Space",
  PGUP: "PageUp",
  PGDN: "PageDown",
  ARROWLEFT: "Left",
  ARROWRIGHT: "Right",
  ARROWUP: "Up",
  ARROWDOWN: "Down",

  // Typed symbols -> Qt names
  "!": "Exclam",
  "\"": "QuoteDbl",
  "#": "NumberSign",
  $: "Dollar",
  "%": "Percent",
  "&": "Ampersand",
  "'": "Apostrophe",
  "(": "ParenLeft",
  ")": "ParenRight",
  "*": "Asterisk",
  "+": "Plus",
  ",": "Comma",
  "-": "Minus",
  ".": "Period",
  "/": "Slash",
  ":": "Colon",
  ";": "Semicolon",
  "<": "Less",
  "=": "Equal",
  ">": "Greater",
  "?": "Question",
  "@": "At",
  "[": "BracketLeft",
  "\\": "Backslash",
  "]": "BracketRight",
  "^": "AsciiCircum",
  _: "Underscore",
  "`": "QuoteLeft",
  "{": "BraceLeft",
  "|": "Bar",
  "}": "BraceRight",
  "~": "AsciiTilde",
})

/**
 * Qt::KeyboardModifier bitmask values. Synonyms (Control/Ctrl,
 * Cmd/Command/Meta) resolve to the same bit so users can spell it
 * however they're used to.
 */
export const KEY_MODIFIERS = Object.freeze({
  SHIFT: 0x02000000,
  CTRL: 0x04000000,
  CONTROL: 0x04000000,
  ALT: 0x08000000,
  OPT: 0x08000000,
  OPTION: 0x08000000,
  META: 0x10000000,
  CMD: 0x10000000,
  COMMAND: 0x10000000,
  WIN: 0x10000000,
  SUPER: 0x10000000,
  KEYPAD: 0x20000000,
})

// Case-insensitive lookup tables. These mirror the frozen maps above
// but key off upper-case strings so token comparison is one operation.
export const KEY_CODE_LOOKUP = new Map(
  Object.entries(KEY_CODES).map(([k, v]) => [k.toUpperCase(), v])
)

export const KEY_ALIAS_LOOKUP = new Map(
  Object.entries(KEY_ALIASES).map(([k, v]) => [k.toUpperCase(), v])
)

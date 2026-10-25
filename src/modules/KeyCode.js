/**
 * Qt::Key values. The key names here match Mudlet's own key names
 * (`KeyUnit::setupKeyNames`, which the "grab key" button prints, and
 * `mudlet.key` in Lua), so users can copy what they see in Mudlet directly.
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

  // Extra editing
  SysReq: 0x0100000a, Clear: 0x0100000b,

  // Locks and AltGr. Bare Shift/Control/Alt/Meta are left out: they are
  // modifier words in a chord, and Mudlet's key grab skips them too.
  AltGr: 0x01001103, CapsLock: 0x01000024, NumLock: 0x01000025,
  ScrollLock: 0x01000026,

  // More function keys
  F25: 0x01000048, F26: 0x01000049, F27: 0x0100004a, F28: 0x0100004b,
  F29: 0x0100004c, F30: 0x0100004d, F31: 0x0100004e, F32: 0x0100004f,
  F33: 0x01000050, F34: 0x01000051, F35: 0x01000052,

  // Extra keys
  Super_L: 0x01000053, Super_R: 0x01000054, Menu: 0x01000055,
  Hyper_L: 0x01000056, Hyper_R: 0x01000057, Help: 0x01000058,
  Direction_L: 0x01000059, Direction_R: 0x01000060,

  // Latin-1
  nobreakspace: 0xa0, exclamdown: 0xa1, cent: 0xa2, sterling: 0xa3,
  currency: 0xa4, yen: 0xa5, brokenbar: 0xa6, section: 0xa7, diaeresis: 0xa8,
  copyright: 0xa9, ordfeminine: 0xaa, guillemotleft: 0xab, notsign: 0xac,
  hyphen: 0xad, registered: 0xae, macron: 0xaf, degree: 0xb0, plusminus: 0xb1,
  twosuperior: 0xb2, threesuperior: 0xb3, acute: 0xb4, mu: 0xb5,
  paragraph: 0xb6, periodcentered: 0xb7, cedilla: 0xb8, onesuperior: 0xb9,
  masculine: 0xba, guillemotright: 0xbb, onequarter: 0xbc, onehalf: 0xbd,
  threequarters: 0xbe, questiondown: 0xbf, Agrave: 0xc0, Aacute: 0xc1,
  Acircumflex: 0xc2, Atilde: 0xc3, Adiaeresis: 0xc4, Aring: 0xc5, AE: 0xc6,
  Ccedilla: 0xc7, Egrave: 0xc8, Eacute: 0xc9, Ecircumflex: 0xca,
  Ediaeresis: 0xcb, Igrave: 0xcc, Iacute: 0xcd, Icircumflex: 0xce,
  Idiaeresis: 0xcf, ETH: 0xd0, Ntilde: 0xd1, Ograve: 0xd2, Oacute: 0xd3,
  Ocircumflex: 0xd4, Otilde: 0xd5, Odiaeresis: 0xd6, multiply: 0xd7,
  Ooblique: 0xd8, Ugrave: 0xd9, Uacute: 0xda, Ucircumflex: 0xdb,
  Udiaeresis: 0xdc, Yacute: 0xdd, THORN: 0xde, ssharp: 0xdf, division: 0xf7,
  ydiaeresis: 0xff,

  // International input (IME, compose, dead keys)
  Multi_key: 0x01001120, Codeinput: 0x01001137, SingleCandidate: 0x0100113c,
  MultipleCandidate: 0x0100113d, PreviousCandidate: 0x0100113e,
  Mode_switch: 0x0100117e, Kanji: 0x01001121, Muhenkan: 0x01001122,
  Henkan: 0x01001123, Romaji: 0x01001124, Hiragana: 0x01001125,
  Katakana: 0x01001126, Hiragana_Katakana: 0x01001127, Zenkaku: 0x01001128,
  Hankaku: 0x01001129, Zenkaku_Hankaku: 0x0100112a, Touroku: 0x0100112b,
  Massyo: 0x0100112c, Kana_Lock: 0x0100112d, Kana_Shift: 0x0100112e,
  Eisu_Shift: 0x0100112f, Eisu_toggle: 0x01001130, Hangul: 0x01001131,
  Hangul_Start: 0x01001132, Hangul_End: 0x01001133, Hangul_Hanja: 0x01001134,
  Hangul_Jamo: 0x01001135, Hangul_Romaja: 0x01001136,
  Hangul_Jeonja: 0x01001138, Hangul_Banja: 0x01001139,
  Hangul_PreHanja: 0x0100113a, Hangul_PostHanja: 0x0100113b,
  Hangul_Special: 0x0100113f, Dead_Grave: 0x01001250, Dead_Acute: 0x01001251,
  Dead_Circumflex: 0x01001252, Dead_Tilde: 0x01001253,
  Dead_Macron: 0x01001254, Dead_Breve: 0x01001255, Dead_Abovedot: 0x01001256,
  Dead_Diaeresis: 0x01001257, Dead_Abovering: 0x01001258,
  Dead_Doubleacute: 0x01001259, Dead_Caron: 0x0100125a,
  Dead_Cedilla: 0x0100125b, Dead_Ogonek: 0x0100125c, Dead_Iota: 0x0100125d,
  Dead_Voiced_Sound: 0x0100125e, Dead_Semivoiced_Sound: 0x0100125f,
  Dead_Belowdot: 0x01001260, Dead_Hook: 0x01001261, Dead_Horn: 0x01001262,

  // Multimedia and launch keys
  AltGr: 0x01001103, Multi_key: 0x01001120, Codeinput: 0x01001137,
  SingleCandidate: 0x0100113c, MultipleCandidate: 0x0100113d,
  PreviousCandidate: 0x0100113e, Mode_switch: 0x0100117e, Kanji: 0x01001121,
  Muhenkan: 0x01001122, Henkan: 0x01001123, Romaji: 0x01001124,
  Hiragana: 0x01001125, Katakana: 0x01001126, Hiragana_Katakana: 0x01001127,
  Zenkaku: 0x01001128, Hankaku: 0x01001129, Zenkaku_Hankaku: 0x0100112a,
  Touroku: 0x0100112b, Massyo: 0x0100112c, Kana_Lock: 0x0100112d,
  Kana_Shift: 0x0100112e, Eisu_Shift: 0x0100112f, Eisu_toggle: 0x01001130,
  Hangul: 0x01001131, Hangul_Start: 0x01001132, Hangul_End: 0x01001133,
  Hangul_Hanja: 0x01001134, Hangul_Jamo: 0x01001135,
  Hangul_Romaja: 0x01001136, Hangul_Jeonja: 0x01001138,
  Hangul_Banja: 0x01001139, Hangul_PreHanja: 0x0100113a,
  Hangul_PostHanja: 0x0100113b, Hangul_Special: 0x0100113f,
  Dead_Grave: 0x01001250, Dead_Acute: 0x01001251, Dead_Circumflex: 0x01001252,
  Dead_Tilde: 0x01001253, Dead_Macron: 0x01001254, Dead_Breve: 0x01001255,
  Dead_Abovedot: 0x01001256, Dead_Diaeresis: 0x01001257,
  Dead_Abovering: 0x01001258, Dead_Doubleacute: 0x01001259,
  Dead_Caron: 0x0100125a, Dead_Cedilla: 0x0100125b, Dead_Ogonek: 0x0100125c,
  Dead_Iota: 0x0100125d, Dead_Voiced_Sound: 0x0100125e,
  Dead_Semivoiced_Sound: 0x0100125f, Dead_Belowdot: 0x01001260,
  Dead_Hook: 0x01001261, Dead_Horn: 0x01001262, Back: 0x01000061,
  Forward: 0x01000062, Stop: 0x01000063, Refresh: 0x01000064,
  VolumeDown: 0x01000070, VolumeMute: 0x01000071, VolumeUp: 0x01000072,
  BassBoost: 0x01000073, BassUp: 0x01000074, BassDown: 0x01000075,
  TrebleUp: 0x01000076, TrebleDown: 0x01000077, MediaPlay: 0x01000080,
  MediaStop: 0x01000081, MediaPrevious: 0x01000082, MediaNext: 0x01000083,
  MediaRecord: 0x01000084, HomePage: 0x01000090, Favorites: 0x01000091,
  Search: 0x01000092, Standby: 0x01000093, OpenUrl: 0x01000094,
  LaunchMail: 0x010000a0, LaunchMedia: 0x010000a1, Launch0: 0x010000a2,
  Launch1: 0x010000a3, Launch2: 0x010000a4, Launch3: 0x010000a5,
  Launch4: 0x010000a6, Launch5: 0x010000a7, Launch6: 0x010000a8,
  Launch7: 0x010000a9, Launch8: 0x010000aa, Launch9: 0x010000ab,
  LaunchA: 0x010000ac, LaunchB: 0x010000ad, LaunchC: 0x010000ae,
  LaunchD: 0x010000af, LaunchE: 0x010000b0, LaunchF: 0x010000b1,
  MediaLast: 0x0100ffff,

  // Device keys
  Call: 0x01100004, Context1: 0x01100000, Context2: 0x01100001,
  Context3: 0x01100002, Context4: 0x01100003, Flip: 0x01100006,
  Hangup: 0x01100005, No: 0x01010002, Select: 0x01010000, Yes: 0x01010001,
  Execute: 0x01020003, Printer: 0x01020002, Play: 0x01020005,
  Sleep: 0x01020004, Zoom: 0x01020006, Cancel: 0x01020001,
})

/**
 * Qt::Key_unknown — the key code Mudlet stores for an unbound key (TKey.h
 * `mKeyCode` default). Used both when auto-wrapping folder keys and when
 * round-tripping them back out.
 */
export const KEY_UNKNOWN = 0x01FFFFFF

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
  NBSP: "nobreakspace", // mudlet.key spells it "nbsp"

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

/**
 * Canonical modifier order for rendering a chord — each Qt modifier bit paired
 * with the single label muddy emits, in the order QKeySequence::toString prints
 * them. The reverse of the synonym-laden {@link KEY_MODIFIERS} lookup; bits are
 * sourced from it so there is one place to change a value.
 *
 * @type {Array<[number, string]>}
 */
export const KEY_MODIFIER_NAMES = Object.freeze([
  [KEY_MODIFIERS.CTRL, "Ctrl"],
  [KEY_MODIFIERS.ALT, "Alt"],
  [KEY_MODIFIERS.SHIFT, "Shift"],
  [KEY_MODIFIERS.META, "Meta"],
  [KEY_MODIFIERS.KEYPAD, "Keypad"],
])

// Case-insensitive lookup tables. These mirror the frozen maps above
// but key off upper-case strings so token comparison is one operation.
export const KEY_CODE_LOOKUP = new Map(
  Object.entries(KEY_CODES).map(([k, v]) => [k.toUpperCase(), v])
)

/**
 * Reverse of {@link KEY_CODES}: Qt key value -> canonical key name. Used to
 * turn a stored key code back into the chord string a muddy author writes.
 */
export const KEY_CODE_NAMES = new Map(
  Object.entries(KEY_CODES).map(([name, code]) => [code, name])
)

export const KEY_ALIAS_LOOKUP = new Map(
  Object.entries(KEY_ALIASES).map(([k, v]) => [k.toUpperCase(), v])
)

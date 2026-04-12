/**
 * Qt::Key values. The key names here match what `QKeySequence::toString()`
 * (and therefore the Mudlet "grab key" button) prints, so users can copy
 * what they see in Mudlet directly.
 */
export const KEY_CODES: Readonly<{
    A: 65;
    B: 66;
    C: 67;
    D: 68;
    E: 69;
    F: 70;
    G: 71;
    H: 72;
    I: 73;
    J: 74;
    K: 75;
    L: 76;
    M: 77;
    N: 78;
    O: 79;
    P: 80;
    Q: 81;
    R: 82;
    S: 83;
    T: 84;
    U: 85;
    V: 86;
    W: 87;
    X: 88;
    Y: 89;
    Z: 90;
    0: 48;
    1: 49;
    2: 50;
    3: 51;
    4: 52;
    5: 53;
    6: 54;
    7: 55;
    8: 56;
    9: 57;
    Space: 32;
    Escape: 16777216;
    Tab: 16777217;
    Backtab: 16777218;
    Backspace: 16777219;
    Return: 16777220;
    Enter: 16777221;
    Insert: 16777222;
    Delete: 16777223;
    Pause: 16777224;
    Print: 16777225;
    Home: 16777232;
    End: 16777233;
    Left: 16777234;
    Up: 16777235;
    Right: 16777236;
    Down: 16777237;
    PageUp: 16777238;
    PageDown: 16777239;
    F1: 16777264;
    F2: 16777265;
    F3: 16777266;
    F4: 16777267;
    F5: 16777268;
    F6: 16777269;
    F7: 16777270;
    F8: 16777271;
    F9: 16777272;
    F10: 16777273;
    F11: 16777274;
    F12: 16777275;
    F13: 16777276;
    F14: 16777277;
    F15: 16777278;
    F16: 16777279;
    F17: 16777280;
    F18: 16777281;
    F19: 16777282;
    F20: 16777283;
    F21: 16777284;
    F22: 16777285;
    F23: 16777286;
    F24: 16777287;
    Exclam: 33;
    QuoteDbl: 34;
    NumberSign: 35;
    Dollar: 36;
    Percent: 37;
    Ampersand: 38;
    Apostrophe: 39;
    ParenLeft: 40;
    ParenRight: 41;
    Asterisk: 42;
    Plus: 43;
    Comma: 44;
    Minus: 45;
    Period: 46;
    Slash: 47;
    Colon: 58;
    Semicolon: 59;
    Less: 60;
    Equal: 61;
    Greater: 62;
    Question: 63;
    At: 64;
    BracketLeft: 91;
    Backslash: 92;
    BracketRight: 93;
    AsciiCircum: 94;
    Underscore: 95;
    QuoteLeft: 96;
    BraceLeft: 123;
    Bar: 124;
    BraceRight: 125;
    AsciiTilde: 126;
}>;
/**
 * Friendly aliases + typed-symbol shortcuts that resolve to a canonical
 * Qt::Key name. Lookup is case-insensitive so "esc", "Esc", "ESCAPE" and
 * "Escape" all land on the same bucket.
 */
export const KEY_ALIASES: Readonly<{
    ESC: "Escape";
    RETURN: "Return";
    ENTER: "Enter";
    BKSP: "Backspace";
    DEL: "Delete";
    INS: "Insert";
    SPC: "Space";
    PGUP: "PageUp";
    PGDN: "PageDown";
    ARROWLEFT: "Left";
    ARROWRIGHT: "Right";
    ARROWUP: "Up";
    ARROWDOWN: "Down";
    "!": "Exclam";
    "\"": "QuoteDbl";
    "#": "NumberSign";
    $: "Dollar";
    "%": "Percent";
    "&": "Ampersand";
    "'": "Apostrophe";
    "(": "ParenLeft";
    ")": "ParenRight";
    "*": "Asterisk";
    "+": "Plus";
    ",": "Comma";
    "-": "Minus";
    ".": "Period";
    "/": "Slash";
    ":": "Colon";
    ";": "Semicolon";
    "<": "Less";
    "=": "Equal";
    ">": "Greater";
    "?": "Question";
    "@": "At";
    "[": "BracketLeft";
    "\\": "Backslash";
    "]": "BracketRight";
    "^": "AsciiCircum";
    _: "Underscore";
    "`": "QuoteLeft";
    "{": "BraceLeft";
    "|": "Bar";
    "}": "BraceRight";
    "~": "AsciiTilde";
}>;
/**
 * Qt::KeyboardModifier bitmask values. Synonyms (Control/Ctrl,
 * Cmd/Command/Meta) resolve to the same bit so users can spell it
 * however they're used to.
 */
export const KEY_MODIFIERS: Readonly<{
    SHIFT: 33554432;
    CTRL: 67108864;
    CONTROL: 67108864;
    ALT: 134217728;
    OPT: 134217728;
    OPTION: 134217728;
    META: 268435456;
    CMD: 268435456;
    COMMAND: 268435456;
    WIN: 268435456;
    SUPER: 268435456;
    KEYPAD: 536870912;
}>;
export const KEY_CODE_LOOKUP: Map<string, 65 | 66 | 67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 | 78 | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 | 90 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 32 | 16777216 | 16777217 | 16777218 | 16777219 | 16777220 | 16777221 | 16777222 | 16777223 | 16777224 | 16777225 | 16777232 | 16777233 | 16777234 | 16777235 | 16777236 | 16777237 | 16777238 | 16777239 | 16777264 | 16777265 | 16777266 | 16777267 | 16777268 | 16777269 | 16777270 | 16777271 | 16777272 | 16777273 | 16777274 | 16777275 | 16777276 | 16777277 | 16777278 | 16777279 | 16777280 | 16777281 | 16777282 | 16777283 | 16777284 | 16777285 | 16777286 | 16777287 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 58 | 59 | 60 | 61 | 62 | 63 | 64 | 91 | 92 | 93 | 94 | 95 | 96 | 123 | 124 | 125 | 126>;
export const KEY_ALIAS_LOOKUP: Map<string, "Space" | "Escape" | "Backspace" | "Return" | "Enter" | "Insert" | "Delete" | "Left" | "Up" | "Right" | "Down" | "PageUp" | "PageDown" | "Exclam" | "QuoteDbl" | "NumberSign" | "Dollar" | "Percent" | "Ampersand" | "Apostrophe" | "ParenLeft" | "ParenRight" | "Asterisk" | "Plus" | "Comma" | "Minus" | "Period" | "Slash" | "Colon" | "Semicolon" | "Less" | "Equal" | "Greater" | "Question" | "At" | "BracketLeft" | "Backslash" | "BracketRight" | "AsciiCircum" | "Underscore" | "QuoteLeft" | "BraceLeft" | "Bar" | "BraceRight" | "AsciiTilde">;
//# sourceMappingURL=KeyCode.d.ts.map
export const PATTERN_TYPES: Readonly<{
    substring: 0;
    regex: 1;
    begin: 2;
    exact: 3;
    lua: 4;
    spacer: 5;
    color: 6;
    prompt: 7;
}>;
export const PATTERN_TYPE_NAMES: readonly string[];
export default class Trigger extends MudletModule {
    constructor(object?: {});
    get triggerType(): any;
    get conditonLineDelta(): any;
    get mStayOpen(): any;
    get mCommand(): any;
    get mFgColor(): any;
    get mBgColor(): any;
    get mSoundFile(): any;
    get colorTriggerFgColor(): any;
    get colorTriggerBgColor(): any;
    get regexCodeList(): any;
    get regexCodePropertyList(): any;
    get isTempTrigger(): any;
    get isMultiline(): any;
    get isPerlSlashGOption(): any;
    get isColorizerTrigger(): any;
    get isFilterTrigger(): any;
    get isSoundTrigger(): any;
    get isColorTrigger(): any;
    get isColorTriggerFg(): any;
    get isColorTriggerBg(): any;
    #private;
}
import MudletModule from "./MudletModule.js";
//# sourceMappingURL=Trigger.d.ts.map
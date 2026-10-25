import MudletModule from "./MudletModule.js";
export default class Alias extends MudletModule {
    #private;
    constructor(object?: {
        regex: string;
        command: string;
    });
    get regex(): any;
    get command(): any;
    toJSON(): any;
    toXMLFragment(): any;
}
//# sourceMappingURL=Alias.d.ts.map
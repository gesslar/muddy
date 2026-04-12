/**
 * Main Muddy package builder class.
 *
 * Orchestrates the process of converting a source directory structure into
 * a Mudlet package (.mpackage) file by:
 * - Reading package metadata from mfile
 * - Discovering and processing module definitions (scripts, aliases, triggers,
 *   etc.)
 * - Building an XML document representation
 * - Packaging everything into a compressed .mpackage file
 */
export default class Muddy {
    /**
     * Main entry point for the Muddy package builder.
     *
     * @param {DirectoryObject} projectDirectory - The root directory of the project to build
     * @param {object} log - Logger instance for output
     * @param {FileObject} [mfileObject] - Optional path to an alternate mfile
     * @returns {Promise<unknown>} The result of the build process
     * @throws {Error} If execution fails at any step
     */
    run(projectDirectory: DirectoryObject, log: object, mfileObject?: FileObject): Promise<unknown>;
    /**
     * Configures the action builder with the processing pipeline steps.
     *
     * @param {AB} builder - Builder instance
     */
    setup(builder: AB): Promise<void>;
    #private;
}
import { DirectoryObject } from "@gesslar/toolkit";
import { FileObject } from "@gesslar/toolkit";
import { ActionBuilder as AB } from "@gesslar/actioneer";
//# sourceMappingURL=Muddy.d.ts.map
/**
 * Type imports.
 *
 * @import {DirectoryObject} from "@gesslar/toolkit"
 */
/**
 * Emits the MuddyHelper.lua watcher script for a project.
 *
 * Shared by both `muddy unpack` (reconstructing a project from an mpackage) and
 * the project generator, so a freshly created or unpacked project ships with a
 * ready-to-use helper to drop into Mudlet.
 */
export default class Helper {
    /**
     * Writes a ready-to-use `<package>.MuddyHelper.lua` watcher script into the
     * project root, from the shipped template. Dropping it into Mudlet hot-reloads
     * the package on every rebuild — no hand-written helper required.
     *
     * @param {DirectoryObject} projectDirectory - The project root to write into
     * @param {string} packageName - The package name to wire the helper to
     * @param {object} glog - Logger instance for output
     * @returns {Promise<void>}
     */
    static emit(projectDirectory: DirectoryObject, packageName: string, glog: object): Promise<void>;
}
import type { DirectoryObject } from "@gesslar/toolkit";
//# sourceMappingURL=Helper.d.ts.map
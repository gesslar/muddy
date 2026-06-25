/**
 * Type imports.
 *
 * @import {DirectoryObject} from "@gesslar/toolkit"
 */
/**
 * Static filesystem helpers shared across muddy.
 */
export default class Disk {
    /**
     * Recursively deletes a directory and its content.
     *
     * @param {DirectoryObject} dir - The directory to delete
     * @param {boolean} [includeSelf=false] - Whether to delete the directory itself
     * @returns {Promise<void>}
     */
    static deleteRecursive(dir: DirectoryObject, includeSelf?: boolean): Promise<void>;
}
import type { DirectoryObject } from "@gesslar/toolkit";
//# sourceMappingURL=Disk.d.ts.map
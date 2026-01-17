import {DirectoryObject, FileObject} from "@gesslar/toolkit"
import {XMLBuilder} from "xmlbuilder2"

/**
 * Metadata from the mfile configuration file.
 */
export interface MfileData {
  package: string
  version?: string
  title?: string
  author?: string
  icon?: string
  outputFile?: boolean
  [key: string]: unknown
}

/**
 * Base context object passed through the pipeline.
 */
export interface BaseContext {
  projectDirectory: DirectoryObject
  mfile: MfileData
}

/**
 * Context with source directory discovered.
 */
export interface SrcContext extends BaseContext {
  srcDirectory: DirectoryObject
}

/**
 * Context for processing a specific module type.
 */
export interface ModuleTypeContext {
  kind: string
  srcDirectory: DirectoryObject
}

/**
 * Context with JSON files discovered.
 */
export interface JsonFilesContext extends ModuleTypeContext {
  jsonFiles: FileObject[]
}

/**
 * JSON definition object from module JSON files.
 */
export interface JsonDefinition {
  name?: string
  script?: string
  isActive?: string | boolean
  isFolder?: string | boolean
  [key: string]: unknown
}

/**
 * A JSON module with its file and parsed definitions.
 */
export interface JsonModule {
  jsonFile: FileObject
  jsonDefinitions: JsonDefinition[]
}

/**
 * Context with loaded JSON modules.
 */
export interface JsonModulesContext extends JsonFilesContext {
  jsonModules: JsonModule[]
}

/**
 * Package tree node structure.
 */
export type PackageNode = Map<string, string | Set<PackageNode> | JsonDefinition[] | unknown[] | PackageNode | FileObject | null>

/**
 * Context with package tree.
 */
export interface PackageContext extends JsonModulesContext {
  pkg: PackageNode
}

/**
 * Context with work directory.
 */
export interface WorkContext extends BaseContext {
  workDirectory: DirectoryObject
  packages: XMLBuilder[]
}

/**
 * Context with generated files.
 */
export interface GeneratedContext extends WorkContext {
  xmlFile?: FileObject
  configFile?: FileObject
  srcDirectory: DirectoryObject
}

/**
 * Result from reading mfile - either success or failure.
 */
export type MfileResult =
  | {projectDirectory: DirectoryObject; mfile: MfileData}
  | {fail: boolean; message: string}

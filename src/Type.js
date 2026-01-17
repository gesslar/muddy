import {URL} from "node:url"
import {Collection, Util} from "@gesslar/toolkit"

// Aliases
const {capitalize} = Util
const {allocateObject} = Collection
const {freeze} = Object

/**
 * Type constants and mappings for Mudlet module types.
 *
 * Provides mappings between singular/plural forms, class constructors,
 * file names, URLs, and XML package tag names for all module types.
 */
const Type = {}

// Base
const single = () => freeze(new Array("alias", "key", "script", "timer", "trigger"))
const plural = () => freeze(new Array("aliases", "keys", "scripts", "timers", "triggers"))

/**
 * Array of singular module type names.
 *
 * @type {Array<string>}
 */
Type.SINGLE = single()

/**
 * Array of plural module type names.
 *
 * @type {Array<string>}
 */
Type.PLURAL = plural()

/**
 * Mapping from singular to plural module type names.
 *
 * @type {Readonly<Record<string, string>>}
 */
Type.TO_PLURAL = freeze(await allocateObject(single(), plural()))

/**
 * Mapping from plural to singular module type names.
 *
 * @type {Readonly<Record<string, string>>}
 */
Type.TO_SINGLE = freeze(await allocateObject(plural(), single()))

const classify = async e => (await import(`./modules/${capitalize(e)}.js`)).default

/**
 * Mapping from plural module type names to their class constructors.
 *
 * @type {Readonly<Record<string, Function>>}
 */
Type.CLASS = Object.freeze(await allocateObject(
  plural(),
  await Promise.all(single().map(classify))
))

const upper = e => e.toUpperCase()

/**
 * Mapping from uppercase type names to plural module type names.
 *
 * @type {Readonly<Record<string, string>>}
 */
Type.TYPES = Object.freeze(await allocateObject(
  single().map(upper),
  plural()
))

const file = e => `${e}.json`

/**
 * Mapping from plural module type names to their JSON file names.
 *
 * @type {Readonly<Record<string, string>>}
 */
Type.FILES = Object.freeze(await allocateObject(
  plural(),
  plural().map(file)
))

const baseUrl = "https://schema.gesslar.dev/muddler/v1/"
const url = e => new URL(`${e}.json`, baseUrl)

/**
 * Mapping from type names to their schema URLs.
 *
 * @type {Readonly<Record<string, URL>>}
 */
Type.URL = Object.freeze(await allocateObject(
  ["mfile", "common", ...plural()],
  ["mfile", "common", ...plural()].map(url)
))

const pack = e => `${capitalize(e)}Package`

/**
 * Mapping from plural module type names to their XML package tag names.
 *
 * @type {Readonly<Record<string, string>>}
 */
Type.PACKAGES = Object.freeze(await allocateObject(
  plural(),
  single().map(pack)
))

/**
 * Sealed Type object containing all module type constants and mappings.
 */
export default Object.seal(Type)

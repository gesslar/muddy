import {URL} from "node:url"
import {Collection, Util} from "@gesslar/toolkit"

// Aliases
const {capitalize} = Util
const {allocateObject} = Collection
const {freeze} = Object

const Type = {}

// Base
const single = () => freeze(new Array("alias", "key", "script", "timer", "trigger"))
const plural = () => freeze(new Array("aliases", "keys", "scripts", "timers", "triggers"))

Type.SINGLE = single()
Type.PLURAL = plural()
Type.TO_PLURAL = freeze(await allocateObject(single(), plural()))
Type.TO_SINGLE = freeze(await allocateObject(plural(), single()))

const classify = async e => (await import(`./modules/${capitalize(e)}.js`)).default

Type.CLASS = Object.freeze(await allocateObject(
  plural(),
  await Promise.all(single().map(classify))
))

const upper = e => e.toUpperCase()

Type.TYPES = Object.freeze(await allocateObject(
  single().map(upper),
  plural()
))

const file = e => `${e}.json`

Type.FILES = Object.freeze(await allocateObject(
  plural(),
  plural().map(file)
))

const baseUrl = "https://schema.gesslar.dev/muddler/v1/"
const url = e => new URL(`${e}.json`, baseUrl)

Type.URL = Object.freeze(await allocateObject(
  ["mfile", "common", ...plural()],
  ["mfile", "common", ...plural()].map(url)
))

const pack = e => `${capitalize(e)}Package`

Type.PACKAGES = Object.freeze(await allocateObject(
  plural(),
  single().map(pack)
))

/**
 * Sealed Type object containing all module type constants and mappings.
 *
 * @type {Readonly<typeof Type>}
 */
export default Object.seal(Type)

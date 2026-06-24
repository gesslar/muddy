# Muddy (the Mudlet package)

This is the in-Mudlet companion to the [**muddy**](https://github.com/gesslar/muddy)
CLI. The CLI builds your `.mpackage`; this package _hot-reloads_ it into a
running Mudlet so you don't have to keep right-clicking → uninstall → reinstall
like an animal.

Install `Muddy.mpackage` in Mudlet and you get a global `Muddy` table. That's
the whole public surface. You wire it up from a **helper package** — a little
script of your own that tells Muddy which projects to watch.

## The gist

1. Run the CLI in watch mode: `muddy . --watch`. It rebuilds whenever you save.
2. A `Muddy` watcher in Mudlet notices the rebuild and reinstalls the package
   for you. Your edits are live.

That's it. The watcher just needs to know your **project root** — the folder
you run `muddy` from — and it figures out the rest.

## Quick start

A helper is just a script that points Muddy at your projects. Drop this in a
Mudlet script and you're off:

```lua
local base = "/home/you/projects/"

MyHelper = MyHelper or {
  projects = {"MyPackage", "AnotherThing", "ThirdProject"},
  watchers = {},
}

function MyHelper:setup()
  if not Muddy then return end -- the Muddy package isn't installed yet

  for _, name in ipairs(self.projects) do
    if not self.watchers[name] then
      self.watchers[name] = Muddy:new({
        path  = base .. name, -- project root you run `muddy` from
        watch = true,
      })
      debugc("Watching " .. name)
    end
  end
end

MyHelper:setup()
```

Edit a file in any of those projects, let the CLI rebuild, and it reinstalls in
Mudlet. Add or remove projects by editing the list. Done.

> **Order matters.** Your helper has to sit _below_ the Muddy package in
> Mudlet's Scripts editor. Scripts run top to bottom, so if your helper is
> above Muddy, the global `Muddy` doesn't exist yet when it runs (the
> `if not Muddy then return end` guard just bails). Drag it underneath.

Watching a single project? You don't even need the loop:

```lua
Muddy:new({path = "/home/you/projects/MyPackage", watch = true})
```

## The `Muddy:new()` options

| field         | what it does                                             |
| ------------- | -------------------------------------------------------- |
| `path`        | Project root you run `muddy` from. Required.             |
| `watch`       | `true` to start watching right away.                     |
| `preremove`   | Runs before the old package is uninstalled.              |
| `postremove`  | Runs after uninstall, before the new install.            |
| `preinstall`  | Runs right before the new package installs.              |
| `postinstall` | Runs after the new package installs.                     |

The four hooks are optional and each can be a function or a string of Lua. Got
an instance? `watcher:stop()` and `watcher:start()` pause and resume it.

## Cleaning up after yourself

Reinstalling a package doesn't clear out Lua state it left in `package.loaded`.
If your packages `require()` their own modules, the stale copies hang around
and the fresh install runs on top of the old cached code.

The fix is a `postremove` hook that uncaches anything matching the package name:

```lua
function MyHelper:killCache(pkg)
  for name in pairs(package.loaded) do
    if name:find(pkg) then
      package.loaded[name] = nil
      debugc("Uncached " .. name)
    end
  end
end

-- pass it as a string hook so it can name the package being reloaded
Muddy:new({
  path       = base .. name,
  watch      = true,
  postremove = ("MyHelper:killCache(%q)"):format(name),
})
```

## How extra do you want to get

The quick start is deliberately bare. A "real" helper grows the obvious extras:
an `active` flag per project so you can park ones you're not touching, fancier
cache-killing, a little reload-the-helper-itself dance after you edit the list.


##
The Muddy companion package is licensed

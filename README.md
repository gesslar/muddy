# muddy

<p align="center">
  <img src="mud-128.png" alt="Description of image">
</p>

HEY!

_HEY!_

Do you love [muddler](https://github.com/demonnic/muddler)?? ME TOO!!! If you
_don't_, then you it only stands to reason that you are entirely ignorant of
the amazing work of [@demonnic](https://github.com/demonnic). And that is
inexcusable. Because _he is a god_ and you need to worship at the altar that is
his amazing work.

That said, I wish it weren't written in Java, cos I can't help. `:'(`

But I know a few bars of [JavaScript](https://www.javascript.com/).

I have tried to make **muddy** work as closely to **muddler** as I could.
Maybe it worked, maybe I failed miserably. idfk, it _Works on My Computer™_.

My version is a clean-room implementation and I haven't even peeked at
demonnic's, because, frankly, as implicated above, I am woefully inadequate
for the Java. Which, honestly? I'm fine with.

So, if you want to use **muddy**, the syntax is the same. The structure it
expects is the same. The output is... errr, probably... the same... ish?

I'm not gonna re-teach you how to use an identical cli-based thing, when,
to repeat, the amazing god that is demonnic has already strived... strove...
striven? to do it already and it's great.

The only difference between invoking **muddy** over **muddler** is the cli.

## Immediate Invocation

```shell
# npm
npx @gesslar/muddy --help

# npm
npx @gesslar/muddy --help
```

## Install as a dependency, if you want, you don't have to

```shell
# npm
npm add -d @gesslar/muddy

# npm
npm i -d @gesslar/muddy
```

## Post Hocktuah

Also, shout out to [@Edru2](https://github.com/Edru2) for
[DeMuddler](https://github.com/Edru2/DeMuddler) which is just sex on a stick.

Which is exactly how everybody likes their sex, yes? Yes. Okay.

## Features unique to muddy

### Add modules

muddy can scaffold new modules directly from the command line using `--add`.
This creates the type directory (if needed), adds an entry to the `{type}.json`
with all available fields from the schema pre-filled, and creates an empty
`.lua` file — ready for you to fill in.

```shell
# Add a named script
muddy . --add script --name "My Script"

# Add an alias with auto-generated temp name (new_alias_1, new_alias_2, ...)
muddy . --add alias

# Short form
muddy . -a trigger --name "Health Warning"
```

Valid types: `alias`, `key`, `script`, `timer`, `trigger`.

### Ignore patterns

muddy supports an `ignore` field in your `mfile` that lets you exclude files
from both module collection and resource injection. This is not available in
muddler.

Add an `ignore` array to your `mfile` with glob patterns:

```json
{
  "package": "MyPackage",
  "version": "1.0.0",
  "ignore": ["**/drafts/**", "**/wip/**", "**/experimental_*"]
}
```

Patterns are matched against relative paths within `src/`. They apply to:

- **Module collection** — any `scripts.json`, `aliases.json`, etc. matching an
  ignore pattern will be skipped entirely, along with their associated Lua files.
- **Resource injection** — any files under `src/resources/` matching an ignore
  pattern will not be copied into the `.mpackage`.

Standard glob syntax is supported (e.g. `*`, `**`, `?`). If `ignore` is omitted
or empty, all files are included as usual.

## License

`@gesslar/muddy` is released under the [0BSD](LICENSE.txt).

This package includes or depends on third-party components under their own
licenses:

| Dependency | License |
| --- | --- |
| [@gesslar/actioneer](https://github.com/gesslar/actioneer) | 0BSD |
| [@gesslar/colours](https://github.com/gesslar/colours) | 0BSD |
| [@gesslar/toolkit](https://github.com/gesslar/toolkit) | 0BSD |
| [adm-zip](https://github.com/cthackers/adm-zip) | MIT |
| [commander](https://github.com/tj/commander.js) | MIT |
| [xmlbuilder2](https://github.com/oozcitak/xmlbuilder2) | MIT |

## Postmate

_did you know there's a javascript.com?? I just found that out. holy shit._

# Inbox

Drop exports here. Each `.json` file appears in the source picker as a source you can switch to, with the app name, string count, import notes and your rewrite progress. No restart needed: open the picker and hit **Rescan**.

```
inbox/
  session-transcripts.strings.json
  hermes-todo/
    hermes-todo.strings.json
    hermes-todo.settings.strings.json
  casino-simulator.strings.json
```

One file per app, or one per surface when an app renders with more than one font. A subfolder per project keeps several agents from stepping on each other.

The format is [`../docs/format.md`](../docs/format.md). Before handing a file over:

```powershell
node scripts/validate-export.mjs inbox/your-app.strings.json
```

Rules of the road:

- Name the file `<app>.strings.json`. The picker shows the file name and the app name from inside the file, so a vague name costs a click every time.
- One font per file. Read `family`, `size` and `weight` from the theme the string renders in.
- `maxPx` comes from the layout, never from the current text.
- Rewrites merge by `id`, so ids must be stable across exports.
- Files here are inputs. Edit them in the app, export the rewritten copy, and leave the originals alone.

Everything in this folder except this README is gitignored.

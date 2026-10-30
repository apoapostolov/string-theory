# Style profiles

Written by **Style** in the header: one markdown file per app, produced by comparing the strings as they ship with the rewrites you marked completed.

```
profiles/
  session-transcripts.md
  hermes-todo.md
```

Each file opens with front matter naming the app, how many pairs it learned from, the model that wrote it and the date, then the rules under fixed headings: voice, sentence shape, replacements, length discipline, punctuation, never, and before/after.

The shape is deliberate. A profile is a skill reference: point **Settings → style profiles → override** at a style skill's `references/` folder and the files are written there instead, so a writing agent loads the app's house rules with the skill rather than from a separate document.

They are documents, not runtime state, which is why they live here instead of under `data/`. Commit them if you want the rules to travel with the repo.

# Folder Merger

A purple folder button at the right end of the file explorer's top bar (the row with New note and New folder) opens
the merge window:

1. **Tick** any folders (search box on top). The numbers show the order you ticked them. A folder inside a ticked one
   is greyed out, since it already comes along.
2. **Name** the new folder. It starts as folder 1's name.
3. **Depth**: ← moves the new folder out one level, → moves it back in, along folder 1's path; ⇤ jumps straight to
   the top of the vault. It starts at the
   deepest folder that holds every ticked one. The line underneath shows exactly where it lands.
4. **Folder / Notes** on each ticked folder: Notes (the default) pours what it holds straight into the new folder;
   Folder keeps it as its own subfolder inside the new one.
5. **Route notes by hand**: under the panel, every note in the ticked folders is listed with where it will land.
   Click that to send one note somewhere else (any folder outside the ticked ones, the top of the vault, or the top
   of the new folder); the x puts it back.
6. **Merge N folders**.

The ⤢ button next to the × makes the window full screen (folders on the left, everything else on the right); it
remembers your choice.

Moves use Obsidian's file manager. Enable **Settings → Files and links → Automatically update internal links** to let Obsidian update links as files move. When two files have the same
name, both are kept and the second gets a number ("Plan 2.md"); same-named subfolders are merged into one. Only the
ticked folders that end up empty go to the trash. If a folder with the chosen name is already there, everything goes
into it.

You can also right-click a folder (or several picked in the explorer) and choose "Merge folders…", or run the
"Merge folders" command.

## Compatibility and safety

Requires Obsidian **1.8.7 or newer** on desktop. The minimum covers the vault-specific storage APIs used to remember the window size. The explorer button uses Obsidian's file-explorer DOM; the command palette and context menu are alternative entry points.

The destination preview shows where files will go before you press Merge. Duplicate filenames are numbered instead of overwritten. Keep a backup before reorganizing a large vault: a merge is a sequence of moves, not a single undoable transaction. If a move fails, completed moves remain in the displayed destination or the individual route destinations; unmoved files stay where they were. Review both before retrying. Empty folders go through Obsidian's configured trash behavior. Closing the window after starting does not cancel an in-progress merge.

## Colours

Set in `styles.css` (same purple as Folder Stats and File Placer); a CSS snippet can override them:

```
body {
	--folder-merger-bg: rgba(139, 92, 246, 0.16);
	--folder-merger-border: #4c1d95;
}
```

## Install by hand

Copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/folder-merger/`, then turn it on
under Settings, Community plugins.

## Build

```
npm ci
npm run qa
```

## Privacy and license

Works locally with vault files. No network requests, telemetry, accounts, or paid features. The window-size preference is stored for this vault. Licensed under [MIT](LICENSE).

## Development and submission

Use Node.js 20 or newer. `npm run qa` type-checks and builds the production bundle, runs merge regression tests against an in-memory vault, and validates metadata, licenses, and authored-source safety. `npm run dev` watches TypeScript changes. See [SUBMISSION.md](SUBMISSION.md) for packaging and the remaining manual smoke checks.

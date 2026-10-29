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
name, both are kept and the second gets a number ("Plan 2.md"). Notes mode merges same-named nested folders;
Folder mode numbers a kept source folder when its name is taken ("A 2"). Only the
ticked folders that end up empty go to the trash. If a folder with the chosen name is already there, everything goes
into it.

You can also right-click a folder (or several picked in the explorer) and choose "Merge folders…", or run the
"Merge folders" command.

## Compatibility and safety

The manifest declares Obsidian **1.8.7 or newer** on desktop. This API floor covers the vault-specific storage APIs used to remember the window size; runtime compatibility on 1.8.7 remains unverified. The explorer button uses Obsidian's file-explorer DOM; the command palette and context menu are alternative entry points.

The button follows current connected explorer toolbars when layout changes are delivered. Retired buttons lose their click handlers and are removed; disabling removes owned buttons and closes owned merge windows. Sixteen actual-source JSDOM tests verify detach/reattach, toolbar replacement, surviving panes, fresh enable and stale callbacks through a controlled modal-open boundary. They establish DOM ownership and click dispatch, not real Obsidian rendering or popout compatibility. See the [local evidence and remaining live checks](SUBMISSION.md#explorer-button-ownership--2026-10-29).

Confirmation checks the displayed source identities and full paths, Folder/Notes choices, destination parent and existing/absent destination, and explicitly routed files/folders. If those change, the attempt closes without moving, creating or trashing anything; reopen and review a fresh plan. Cancel, close and plugin unload retire that prompt, and each prompt can start at most once. Old route suggestions cannot change a newer preview. A changed suggestion destination must be chosen again.

The file list and count are a preview, **not a frozen inventory**: ordinary additions, removals, renames and content edits inside the selected folders are taken from current vault state when the merge runs. Explicit routes require the same file and destination at their displayed paths; edits to routed file contents are allowed. Existing destination contents can change and collision suffixes are assigned as moves run. Validation happens before execution, not throughout asynchronous operations; it does not lock out sync or other writers. See the [displayed-plan evidence and limits](SUBMISSION.md#displayed-plan-and-prompt-lifetime--2026-10-29).

The destination preview shows intended folders; collision suffixes are assigned as moves run. Keep a backup before reorganizing a large vault: a merge is a sequence of moves, **not an atomic or undoable transaction**. Empty folders go through Obsidian's configured trash behavior. Closing the window after starting does not cancel an in-progress merge.

### If a merge stops

The recovery window lists acknowledged operations, the failed operation, and each original source file's current path as reported by Obsidian. A folder move includes its descendants. Copy the selectable report before closing; it is not saved across reloads. It reports paths, not verified disk contents. A failed host operation can change state before rejecting, so inspect its paths too; resolve any `UNRESOLVED` entry before proceeding.

1. Inspect the sources, destination and external route folders. Preserve their current contents and a backup. Completed moves remain in place; no automatic rollback or retry occurs. A trash failure can leave an empty source folder even after its files have moved.
2. Reopen Merge folders and select only remaining sources from their **current paths**. Keep the intended Folder/Notes mode and the same destination. Recreate only routes that are still pending; do not reselect completed external routes or move the destination's completed contents again.
3. If only one source remains, also select the existing destination, leave that destination in Notes mode, and set the name/depth to that exact destination. The destination is retained while the remaining source is processed. If only empty-folder cleanup remains, inspect the folders and use Obsidian's trash command.
4. Verify contents and actual link destinations after retry. Changed vault contents can produce different numeric suffixes. Link updates depend on Obsidian's preference and runtime behavior.

Automated recovery checks verify exact synthetic contents after successful routes followed by move failures, later nested/file and folder collisions, and nested/source trash failures, followed by fresh plans. These host-double tests do not establish filesystem crash safety, concurrent external-writer safety, or live link updates. **Live Folder/Notes and recovery checks are blocked by app access**, including the declared minimum and installed desktop version. See the [evidence and reproducible live drill](SUBMISSION.md#partial-failure-recovery--2026-10-28).

## Colours

Set in `styles.css` (same purple as Folder Stats and File Placer); a CSS snippet can override them:

```
body {
	--folder-merger-bg: rgba(139, 92, 246, 0.16);
	--folder-merger-border: #4c1d95;
}
```

## Install by hand

This is a local submission candidate; live compatibility and community acceptance remain unverified. In a disposable test vault, create `<vault>/<config-dir>/plugins/folder-merger/` (the config directory is normally `.obsidian`). Copy `main.js`, `manifest.json` and `styles.css` into it, reload Obsidian, then enable the plugin under **Settings → Community plugins**.

## Build

```
npm ci
npm run qa
```

## Privacy and license

Works locally with vault files. No network requests, telemetry, accounts, or paid features. The window-size preference is stored for this vault. Licensed under [MIT](LICENSE).

## Development and submission

Use Node.js 20 or newer. `npm run qa` type-checks and builds the production bundle, runs merge/recovery tests against host doubles and explorer/modal action tests in JSDOM, and validates metadata, licenses, and authored-source safety. JSDOM is development-only and is not included in the plugin bundle. `npm run dev` watches TypeScript changes. See [SUBMISSION.md](SUBMISSION.md) for packaging and the remaining manual smoke checks.

# Submission preparation

Local preparation only. No tag, release, upload, directory submission, or remote change is made by these scripts.

## Repeatable checks

Use Node.js 20 or newer. Run `npm ci` and `npm run qa` from this repository. QA builds `main.js`, type-checks TypeScript, runs focused regression tests, and checks manifest/package/lock/version-map agreement, required files (including the maintained `styles.css`), MIT licensing, no authored HTML string sinks, and a production bundle without inline source maps. This is a local check, not Obsidian's official scanner or approval.

## Manual smoke checks before a future release

The automated tests use a small Obsidian API double; they do not replace a run in the actual app. These checks remain for an isolated test vault on the declared minimum Obsidian version and current stable version:

1. In a disposable vault, create two folders with same-named notes and same-named nested folders. Merge them; confirm numbered copies retain both contents and only empty folders are trashed.
2. Repeat with both Folder and Notes modes, an existing destination, a file routed elsewhere, and one routed to the new root. Enable automatic internal-link updates and inspect backlinks.
3. Try invalid destinations, renamed/deleted source folders while the modal is open, and a second merge while one is running. Confirm no overwrite or concurrent merge.
4. Exercise the explorer button, context menu and command; use keyboard controls, window expansion, light/dark themes and disable/re-enable cleanup.

## Future packaging (not performed)

The prepared version is `1.0.0`. Keep the version in `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` synchronized. The directory ID is `folder-merger`. Install the three assets in `<config-dir>/plugins/folder-merger/` for manual testing; the configuration directory is normally `.obsidian`. Reload before enabling.

When separately authorized to publish, confirm the name and ID are still available in the community directory, make the source repository publicly reviewable, and create a release whose tag exactly matches the manifest version (no `v` prefix). Attach `main.js`, `manifest.json`, and `styles.css` as release assets. Keep the README, LICENSE, and versions.json at the repository root. Then follow Obsidian's current submission flow. Directory acceptance is decided by Obsidian's reviewers.

Guidelines reviewed for this preparation:

- [Manifest schema](https://docs.obsidian.md/Reference/Manifest)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin%20guidelines)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)

## Review — 2026-10-28

Agent decision, 2026-10-28: review the seven completed local preparations before adding features, because their shared explorer behavior and remaining host checks need validation.

Fresh `npm run qa` passed: 6 tests, TypeScript, production build, and package checks. The existing plan validation, collision preservation, routing, and merge-lock tests still pass. No merger code changed in this review.

This is automated local evidence, not a live Obsidian or minimum-version certification. The real-app checklist above remains open. Nothing was installed into the personal vault, pushed, released, or submitted.

## Partial-failure recovery — 2026-10-28

**Status: automated contract verified; required live checks blocked, deliverable incomplete.**
Computer Use returned “Computer Use was not approved to use Obsidian.” No other
app-control route was attempted after that denial. Installed bundle metadata
reports 1.14.5; no running-app version was observed. Minimum 1.8.7, other desktop
platforms, popouts and the original manual checklist remain unverified. Mobile
is outside the desktop-only manifest. No community acceptance is claimed.

Agent decision — 2026-10-28: retain the merge algorithm because no preservation
assertion failed; replace the generic transient error with a copyable recovery
window because users need completed operations and current paths to re-plan.
The report tracks acknowledged create/move/trash operations, the rejected
operation, and original-to-current paths for all selected source files. It
includes files carried by a folder rename and marks unresolved host objects.
It does not read file contents or persist an undo log. Validation/concurrency
failures report that this attempt did not start. The preview now describes
preference-dependent link updates instead of promising links always work.

### Injected test boundaries

`tests/merge.test.mjs` retains six original cases and adds six cases:

| Injected rejection (before mutation) | State verified before fresh retry |
| --- | --- |
| Notes lead-folder move after external route | External collision copy remains; both source contents retained. |
| Folder source move after external and root routes | Both routed files stay moved; only pending routes are recreated. |
| Later Notes nested collision | Lead rename and earlier root/nested moves remain; failed numbered note and later note stay in source. |
| Later Folder collision | Earlier numbered folder and external route remain; later folder stays at its current path. |
| Empty nested-folder trash | Completed nested notes remain; later root note and nonempty source parent survive. |
| Empty top-level source trash | All files are already moved; empty source remains until re-planned cleanup. |

Every new case compares the complete fixture's exact path-to-content inventory
before failure, after failure and after recovery, plus the content multiset and
live parent references. The host double rejects overwrites and nonempty trash.
Each successful fresh plan on the same app proves the lock was released; plans
reselect current paths and omit completed routes. Reports are checked against
acknowledged mutations and every original selected file. The tests do not emulate
real filesystem faults, link maintenance, sync or concurrent external writers.
Recovery-window tests separately exercise the real modal catch path with a UI
double; they are not screenshots or live rendering evidence.
One report case makes the host move a folder and then reject: the current-path
inventory shows the moved descendant while the operation remains failed and
unacknowledged. This verifies reporting under that simulated condition, not
disk recovery after arbitrary partial filesystem changes.

Final local validation on Node 24.22.0 / npm 11.19.1:

- `npm run qa`: exit 0; **18 tests**, TypeScript, production build and package
  checks pass. Twelve are merge tests, six exercise recovery reporting/UI doubles.
- `node --check tests/recovery-drill.mjs` and fixture module: exit 0.
- `verify-originals` for each of `notes`, `folder`, `recovery`: exit 0, all 11
  synthetic files match their prepared state. These are baseline checks, not
  completed live merges or recovered disk results. `verify-final` and
  `verify-links` await permitted live execution.
- Final installed test assets match this checkout's rebuilt `main.js`, manifest
  and maintained stylesheet; every test plugin enable list remains empty.
- `git diff --check`: pass after removing a trailing stylesheet blank line.

### Disposable live drill (prepared, not executed in Obsidian)

One reusable fixture lives in `tests/fixtures/partial-recovery.mjs`; the script
`tests/recovery-drill.mjs` only prepares/checks files. It never drives Obsidian or
runs a merge. The prepared root is
`../obsidian-plugin-test-vaults/folder-merger-recovery-2026-10-28/`, with three
vaults: `notes`, `folder`, `recovery`. Each has ten uniquely marked content notes
plus `Inbound.md` with ten aliased links. Local plugin assets are installed with
an empty enable list. The link preference has not been configured or observed.

To prepare another untouched run, use
`node tests/recovery-drill.mjs prepare <fresh-run-name>`; it refuses to overwrite
an existing run. `verify-originals <vault>` compares all 11 exact fixture contents
and paths, including the prewritten intermediate state for `recovery`.

When permitted app access is available:

1. Open `notes`, enable Folder Merger, enable **Automatically update internal
   links**, and record the running app version and preference. Select A then B
   (in that order), both Notes mode, name Combined at Top. Route `A/External.md`
   to Outside and `B/nested/Top.md` to the new folder's root; merge.
2. Repeat in `folder`, both Folder mode, same selection order/destination/routes.
3. Open `recovery` with the same preference. This fixture **synthetically** starts
   after the two routes and `A/Same.md` have moved; inbound link text for those
   three moves was also prewritten. It is not evidence of an injected app failure.
   Reopen the merger, select current A then B, both Notes, Combined at Top,
   **no routes**. Complete the remaining work.
4. For each vault run `node tests/recovery-drill.mjs verify-final <vault>` and
   `node tests/recovery-drill.mjs verify-links <vault>`. The former checks every
   content note and removal of emptied root sources; the latter checks inbound
   link text separately and requires an unambiguous expected content marker.
   Open all ten links in Obsidian and record actual paths/markers and backlinks.
   Static link-text checks cannot establish Obsidian's resolved destinations.

Expected moved paths (the four preexisting content notes remain unchanged):

| Original | Notes / recovery | Folder |
| --- | --- | --- |
| A/Same.md | Combined/Same 2.md | Combined/A 2/Same.md |
| A/nested/Same.md | Combined/nested/Same 2.md | Combined/A 2/nested/Same.md |
| B/Same.md | Combined/Same 3.md | Combined/B/Same.md |
| B/nested/Same.md | Combined/nested/Same 3.md | Combined/B/nested/Same.md |
| A/External.md | Outside/External 2.md | Outside/External 2.md |
| B/nested/Top.md | Combined/Top.md | Combined/Top.md |

| Required live behavior | Observed result |
| --- | --- |
| Notes collisions, nested merging and routing | Blocked — app access denied. |
| Folder collisions and routing | Blocked — app access denied. |
| Automatic link updates, opened destinations and backlinks | Blocked — not observed. |
| Fresh plan from synthetic intermediate state | Blocked — only prepared on disk. |
| Visible recovery window and actual host-failure behavior | Blocked — UI doubles only. |

### Current official guidance check

Rechecked the official [plugin guidelines source](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/main/en/Plugins/Releasing/Plugin%20guidelines.md),
[self-critique checklist](https://docs.obsidian.md/oo/plugin),
[submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
and [internal-link help](https://obsidian.md/help/links) on 2026-10-28. The new UI
uses text/value assignment and DOM helpers, CSS classes and theme variables;
moves/trash still use FileManager. The checklist recommends preference-aware
trash, and the requirements call for a compatible minimum app version. The
declared API floor is not a tested compatibility claim. Link updates remain
preference-dependent; documentation cannot substitute for the blocked live drill.

## Quality review — 2026-10-29

agent decision 2026-10-28: review the four accepted follow-ups before further improvements; retain the established tests and runtime protocols because no new source defect justifies duplicating them.

Fresh `npm run qa` passes **18/18 tests** (12 merge and six report/UI-boundary cases), TypeScript, production build and package checks. Reviewed metadata/lock/version agreement, README, maintained stylesheet and the existing recovery evidence. No concrete implementation or packaging regression was found; production assets remain byte-identical. Manual installation now names the configured directory (normally `.obsidian`), folder creation, reload and local-candidate status.

The partial-failure section above remains the sole detailed recovery protocol. Synthetic preservation/retry and mutation-then-rejection reporting do not establish disk crash safety, real link updates or visible app behavior. All older blocked live gates remain open; no fixture regeneration or app-access retry occurred.

`git diff --check` passes. Nothing was pushed, tagged, released or submitted.

Official manifest, submission requirements, developer policies, plugin guidelines and release instructions were rechecked on 2026-10-29. Local metadata, disclosures and licensing checks do not establish minimum-version runtime compatibility, directory name availability or community approval.

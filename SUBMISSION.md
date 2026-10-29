# Submission preparation

Latest local checkpoint: [Displayed plan and prompt lifetime — 2026-10-29](#displayed-plan-and-prompt-lifetime--2026-10-29). Earlier entries below remain dated history.

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

## Follow-up quality review — 2026-10-29

agent decision 2026-10-28: retain the accepted implementations and existing fault matrices because independent read-only review found no concrete regression; reconcile evidence and correct documentation against source and locked dependencies.

Rechecked unchanged candidate `a7e6184`: README/install instructions, metadata/lock/version agreement, maintained CSS, MIT license, production configuration and existing recovery evidence agree. No concrete packaging/documentation defect was found. The recovery algorithm and fixtures were preserved.

Fresh `npm run qa` passes **18/18 tests** (twelve merge and six reporting/UI cases), TypeScript, production build and package checks. Synthetic exact-content preservation and fresh-plan retry remain separate from mutation-before-rejection reporting. The partial-failure section above remains the sole recovery protocol; its live Folder/Notes, link updates, popout/platform and minimum-version gates are still blocked or unverified. No fixture regeneration or app-access retry occurred.

Rechecked current official manifest, submission requirements, developer policies, plugin guidelines and submission instructions linked in this record. Local metadata, licensing and automated checks do not establish directory availability, minimum-version runtime compatibility or community approval. Production assets match the reviewed source and remain byte-identical to this review's starting candidate; `git diff --check` passes. No tests were added because no new implementation defect was reproduced. No app-access retry, installation, push, tag, release or submission occurred.

## Explorer button ownership — 2026-10-29

**Status: local lifecycle candidate verified; live explorer and compatibility gates remain open.**

**agent decision 2026-10-28:** reconcile explicitly owned buttons against connected current explorer toolbars, removing obsolete listeners/nodes before releasing ownership. This repairs the actual-source defect at `d1be49d` without changing merge/recovery behavior. Keep one owner editing and an independent read-only lifecycle reviewer. Use locked development-only JSDOM 26.1.0 for real synthetic DOM attachment, selectors, removal and event dispatch; the existing registration no-ops cannot establish listener release.

`tests/explorer-ownership.test.mjs` was persisted before production edits: the initial 13 cases passed three and failed ten. The final 16-case suite replayed against exported baseline source passes three and fails thirteen (exit 1). In its complete sequence, the detached toolbar keeps one button but the plugin owns zero; reattachment keeps that same unowned node; unload leaves it present. A fresh instance owns zero and clicking the leftover opens zero modals because the old owner is stopped. Candidate passes the same suite: detachment removes the node, reattachment creates a functional owned replacement, unload leaves zero buttons, and fresh enable creates one functional current-owner button.

The sixteen cases check exact node identities and per-toolbar counts, actual click-to-modal opening, explicit native listener removal, retained callback invalidation, unload before/after detached reconciliation, toolbar replacement with the old bar connected elsewhere, a connected pane removed from inventory, independent surviving panes, detached listed panes, missing/later toolbars, duplicate leaves/layout delivery, externally removed/moved buttons, sixty reuse cycles, late layout-ready/layout/click/command callbacks, command/context selections and existing modal-close cleanup. Three cases deliver stale clicks before layout reconciliation after detachment, inventory removal or toolbar replacement. Those clicks are already inert; listener/node removal follows layout reconciliation or unload. Ownership stays bounded to current buttons after reconciliation, with no accumulating per-button plugin-lifetime cleanup registrations.

Focused commands:

```sh
node --test tests/explorer-ownership.test.mjs
# Replay the persisted regressions without changing the candidate checkout:
baseline_dir=$(mktemp -d)
for file in main.ts modal.ts merge.ts; do
  git show "d1be49d:src/$file" > "$baseline_dir/$file"
done
FOLDER_MERGER_SOURCE="$baseline_dir/main.ts" node --test tests/explorer-ownership.test.mjs
# Expected: exit 1, three pass and thirteen fail.
```

Final local validation: **34/34 QA tests** (16 explorer lifecycle, 12 unchanged merge and six unchanged recovery/report cases), TypeScript, production build and package checks pass; `git diff --check` passes. Environment: Node 24.22.0, npm 11.19.1, installed Obsidian declarations 1.14.4. Runtime npm dependencies remain empty; JSDOM is absent from the production bundle. Authored stylesheet, modal/merge source, manifest/version map and previous tests/helpers are unchanged. No fixture generation or app-access retry occurred.

The installed Obsidian declarations specify that `registerEvent`/`registerDomEvent` release on component unload; `onLayoutReady` returns void and may run immediately or later. This implementation releases dynamic button listeners explicitly on retirement and unload, and guards late callbacks. The private explorer toolbar selector remains a live compatibility gate.

JSDOM supplies one synthetic document for multiple panes. Host inventory/events, `createEl`, `setIcon` and plugin lifecycle delivery are doubles. The actual `MergeModal` constructor and `onClose` run, but the controlled host `Modal.open` records opening without invoking `onOpen`; this suite does not establish modal rendering, focus, keyboard use, merge execution, SVG appearance, cross-window behavior or browser heap collection. Fresh enable means a new candidate instance after candidate unload, not migration/adoption of orphan nodes or unknown handlers left by an already-broken older version. Reload Obsidian when installing updated assets as described in the README.

Still required in the existing isolated live test environment, on minimum 1.8.7 and current stable: click the explorer button after pane detach/reattach and toolbar recreation, keep a second pane working, move explorers to/from popouts, disable with connected/detached panes, then enable fresh and verify exactly one functional button per supported toolbar. Confirm command/context entry points, modal close, light/dark appearance and keyboard controls. The earlier live Folder/Notes recovery, actual link targets/backlinks and platform gates in this record remain blocked/unverified. No community approval, push, tag, release, submission or personal-vault installation is claimed.

## Four-fix quality REVIEW — 2026-10-29

agent decision 2026-10-28: accept this bounded local REVIEW only after independent source/contract review and fresh checks; preserve live/community gates because synthetic hosts and local packaging cannot establish them.

Reviewed current connected toolbar inventory, direct-parent and callback ownership, stale clicks before layout, explicit listener/node removal, independent panes and fresh enable. Unchanged merge/recovery/report behavior remains consistent with its existing evidence. No new defect found. The 16 JSDOM ownership tests use a controlled modal-open boundary, not visible modal rendering or live recovery.

Fresh `npm run qa` passed **34/34 tests**, TypeScript, production build and package checks. No lint command is configured in this repository. This QA ran once for this REVIEW; standalone results across all seven are **382 tests**, plus **12 shared cases**. The preceding 365-plus-12 figure was an arithmetic intake expectation; the 17 new graph cases account for the difference.

README installation/development requirements, manifest/package/lock/root-lock/version-map agreement, licenses/notices, dependency classification and production artifacts were checked against actual configuration. Current official [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin%20guidelines), [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [manifest schema](https://docs.obsidian.md/Reference/Manifest) and [submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) were rechecked. Declared minimums remain unverified runtime gates; local consistency is not hosted-scanner or community approval.

Existing live checklists and recovery protocols above remain their sole homes; no app-access retry, personal-vault installation, push, tag, release or submission occurred. Production assets are byte-identical to the starting candidate.

## Displayed plan and prompt lifetime — 2026-10-29

**Status: local candidate verified; live modal/explorer/popout/minimum-version and recovery/link gates remain open.**

**agent decision 2026-10-28:** reject and close obsolete displayed intent, requiring a newly reviewed prompt. Capture source identity/full path, per-source Folder/Notes mode, exact destination path, parent identity/path, destination absence or existing identity, and explicit routed file/destination identity/path at preview rendering. Show selected folders' parent paths. Re-rendering by a deliberate choice updates the preview; confirmation itself never recaptures changed intent. Keep current contents rather than freeze file inventory because this is a folder move tool, not a transaction. One editing owner and an independent read-only reviewer; Mac toolchain only.

`src/modal.ts` checks that snapshot synchronously before passing the captured plan to the unchanged `mergeFolders`. It retires each prompt before dispatch and on close/cancel/unload. Per-prompt ownership means closing or consuming one does not retire another. Route rows bind the preview revision and file path; suggestion items bind the offered destination identity/path. Superseded/cancelled suggestions and retained callbacks cannot change the plan. A stale suggestion destination requires a fresh choice. The class owns the public `selectSuggestion` boundary so acceptance precedes its own close; installed Obsidian 1.14.4 declarations expose this method and `FuzzyMatch` without specifying inherited close/choice order. No assumption about that private ordering is needed.

The count/list are explicitly a preview. Un-routed file additions/removals/renames and content edits may change what moves; explicit routed files must retain identity/path, though their content edits are allowed. Existing destination contents may change and current collision suffixes preserve both. Source identity/path and destination existence cannot silently change. Validation is a pre-execution check with no await before dispatch and the merge's initial validation/operation; later operations are asynchronous and not atomic. Changes that occur and are fully restored between checks are not detected. Closing/unloading after execution starts does not roll back or cancel it. The existing per-App lock, FileManager move/trash delegation, partial-failure report and deliberate fresh recovery remain unchanged.

### Persisted evidence

`tests/displayed-plan.test.mjs` bundles actual main, modal and merge together, so tests invoke rendered callbacks and the real per-App lock/algorithm. JSDOM supplies native buttons and Enter events; explicit host doubles supply Modal/FuzzySuggestModal, plugin lifecycle, vault objects/operations, notices and storage. Exact ordered create/move/trash arguments and full synthetic file-content/path inventories are asserted. Retained-callback cases deliberately invoke callbacks beyond normal DOM removal; they are not claims of real Escape/backdrop delivery or desktop modal coexistence.

- Initial persisted suite at `6b6610bfcd9a5f6344f2cf3ea8f2df64c351b2c4`: **44 failures / 52 cases**, eight valid controls pass, before production edits. Output: `tests/evidence/displayed-plan-baseline.txt`.
- Final expanded suite replay against the same exported source: **55 failures / 70 cases**, fifteen controls pass. Output: `tests/evidence/displayed-plan-baseline-replay.txt` (captured output trailing whitespace normalized).
- Both baseline button and Enter traces display `Synthetic›Parent›Combined`, then move `MovedParent/A` to `MovedParent/Combined`, move the second note and trash the emptied second source. Close/cancel/unload retained callbacks also perform the merge. Traces record the preview, callback, operation arguments and final exact contents/paths before assertions fail.
- Some baseline cases already reject in merge validation (deleted/replaced sources or routes); those fail the new stale-prompt feedback assertion, not a content-preservation assertion. A file newly occupying the target disables execution but previously leaves the obsolete prompt open. Do not interpret all baseline failures as mutations.
- Candidate focused suite: **70/70 pass**. All stale/closed intent cases assert zero merge mutations and unchanged synthetic inventories. Controls cover selected/existing/new destinations, current inventory/content/collisions, mixed/all-Folder modes, external/new-root/vault-root/default/reset routes, deliberate name/depth changes, fresh review after drift/new occupancy, independent prompts, repeat callbacks during/after execution, per-App serialization and later failure followed by one-source-plus-existing-destination recovery.
- Independent read-only source/test review found no blocking defect. Final `npm run qa`: **104/104 tests** (70 displayed-plan, 16 explorer, 12 merge, six recovery/report), TypeScript, production build and package checks. The one old deletion-report assertion now expects the explicit out-of-date message; all its no-mutation/report checks remain. No configured lint command. `git diff --check` passes; `main.js` rebuilt from final source. CSS, main/merge source, dependency/metadata/version files are unchanged.

Replay without changing the candidate checkout:

```sh
baseline_dir=$(mktemp -d)
for file in main.ts modal.ts merge.ts; do
  git show "6b6610b:src/$file" > "$baseline_dir/$file"
done
FOLDER_MERGER_INTENT_SOURCE="$baseline_dir/main.ts" node --test tests/displayed-plan.test.mjs
# Expected: exit 1, 15 pass and 55 fail.
node --test tests/displayed-plan.test.mjs
# Candidate: 70 pass.
```

The host double's inherited suggestion selection closes before choice delivery; the candidate's public override takes control of that ordering. This verifies our acceptance boundary, not the real host's event ordering, fuzzy matching, focus or keyboard navigation. Independent prompts are synthetic lifecycle tests, not observed desktop coexistence. Tests do not establish filesystem durability, crash safety, external-writer safety, live links/backlinks, minimum-version or popout compatibility.

Still required in the existing isolated live environment: both confirmation paths after ancestor/source/target/route changes; cancellation/Escape/backdrop and unload; suggestion selection/cancellation with mouse and keyboard; fresh review and independent windows where supported; all prior explorer and minimum-1.8.7/current-version checks. The partial-failure section above remains the sole blocked recovery/link protocol. No duplicate app-access attempt, new fixture installation, personal-vault installation, push, tag, release or submission occurred.

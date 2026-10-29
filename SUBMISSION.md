# Submission preparation

Local preparation only. No tag, release, upload, directory submission, or remote change is made by these scripts.

## Repeatable checks

Use Node.js 20 or newer. Run `npm ci` and `npm run qa` from this repository. Normal Terminal also requires existing Python 3 on macOS or Linux for the PTY tests. QA builds `main.js` and `styles.css`, type-checks TypeScript, runs focused regression tests, and checks manifest/package/lock/version-map agreement, required files, MIT licensing, no authored HTML string sinks, and a production bundle without inline source maps. This is a local check, not Obsidian's official scanner or approval.

## Manual smoke checks before a future release

The automated tests use a small Obsidian API double; they do not replace a run in the actual app. These checks remain for an isolated test vault on the declared minimum Obsidian version and current stable version:

1. In a disposable vault, create two folders with same-named notes and same-named nested folders. Merge them; confirm numbered copies retain both contents and only empty folders are trashed.
2. Repeat with both Folder and Notes modes, an existing destination, a file routed elsewhere, and one routed to the new root. Enable automatic internal-link updates and inspect backlinks.
3. Try invalid destinations, renamed/deleted source folders while the modal is open, and a second merge while one is running. Confirm no overwrite or concurrent merge.
4. Exercise the explorer button, context menu and command; use keyboard controls, window expansion, light/dark themes and disable/re-enable cleanup.

## Future packaging (not performed)

The prepared version is `1.0.0`. Keep the version in `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` synchronized. The directory ID is `folder-merger`. Install the three build assets in `.obsidian/plugins/folder-merger/` for manual testing.

When separately authorized to publish, confirm the name and ID are still available in the community directory, make the source repository publicly reviewable, and create a release whose tag exactly matches the manifest version (no `v` prefix). Attach `main.js`, `manifest.json`, and `styles.css` as release assets. Keep the README, LICENSE, and versions.json at the repository root. Normal Terminal's third-party notices are embedded in its JavaScript as well as tracked in source. Then follow Obsidian's current submission flow. Directory acceptance is decided by Obsidian's reviewers.

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

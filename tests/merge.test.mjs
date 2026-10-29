import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource, obsidian, TFolder, TFile } from './load-source.mjs';
const { mergeFolders, validFolderName, MergeFailure } = await loadSource('src/merge.ts', obsidian);
function vault() {
  const root = new TFolder('/');
  const entries = new Map([['/', root]]);
  const mutations = [];
  const folder = (path) => {
    if (entries.has(path)) return entries.get(path);
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    const item = new TFolder(path, parent); entries.set(path, item); return item;
  };
  const file = (path, content = `Synthetic contents of ${path}\n`) => {
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    const item = new TFile(path, parent); item.content = content; entries.set(path, item); return item;
  };
  const app = {
    vault: { getAbstractFileByPath: (p) => entries.get(p) ?? null, createFolder: async (p) => { mutations.push(['create', p]); return folder(p); } },
    fileManager: {
      renameFile: async (item, path) => {
        assert(!entries.has(path), `refuse overwrite: ${path}`);
        assert(!path.startsWith(item.path + '/'), 'refuse move into itself');
        mutations.push(['rename', item.path, path]);
        item.parent.children.splice(item.parent.children.indexOf(item), 1);
        item.parent = entries.get(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/');
        assert(item.parent instanceof TFolder);
        item.parent.children.push(item);
        const old = item.path;
        for (const [key, value] of [...entries]) if (key === old || key.startsWith(old + '/')) {
          entries.delete(key); value.path = path + key.slice(old.length); entries.set(value.path, value);
        }
      },
      trashFile: async (item) => {
        assert.equal(item.children.length, 0, 'only empty folders may be trashed');
        mutations.push(['trash', item.path]); entries.delete(item.path);
        item.parent.children.splice(item.parent.children.indexOf(item), 1);
      },
    },
  };
  return { app, folder, file, entries, mutations };
}
const plan = (path, kinds = new Map(), routes = new Map()) => ({ path, kinds, routes });
test('rejects cross-platform reserved names but accepts existing parent punctuation', async () => {
  for (const name of ['CON', 'nul.txt', 'LPT1', '../x', 'trailing.', 'has\u0000null']) assert(!validFolderName(name), name);
  const v = vault(); const a = v.folder('[Projects]/A'), b = v.folder('[Projects]/B');
  await mergeFolders(v.app, [a, b], plan('[Projects]/Combined'));
  assert(v.entries.has('[Projects]/Combined'));
});
test('merges nested folders and preserves every collision with numbered filenames', async () => {
  const v = vault(); const a = v.folder('A'), b = v.folder('B');
  const first = v.file('A/nested/Plan.md'), second = v.file('B/nested/Plan.md');
  v.file('A/nested/Plan 2.md');
  const result = await mergeFolders(v.app, [a, b], plan('Combined'));
  assert.equal(first.path, 'Combined/nested/Plan.md');
  assert.equal(second.path, 'Combined/nested/Plan 3.md');
  assert.equal(result.renamed, 1);
  assert.equal([...v.entries.values()].filter(f => f instanceof TFile).length, 3);
  assert(!v.entries.has('B'));
});
test('keeps folders and routes files to external folders and the new root', async () => {
  const v = vault(); const a = v.folder('A'), b = v.folder('B'), outside = v.folder('Outside');
  const routed = v.file('A/to-out.md'), top = v.file('B/nested/top.md'), kept = v.file('B/kept.md');
  await mergeFolders(v.app, [a, b], plan('Combined', new Map([[a, 'folder'], [b, 'folder']]), new Map([[routed, outside], [top, null]])));
  assert.equal(routed.path, 'Outside/to-out.md'); assert.equal(top.path, 'Combined/top.md'); assert.equal(kept.path, 'Combined/B/kept.md');
});
test('can merge into a selected folder or an existing unrelated destination', async () => {
  for (const path of ['A', 'Existing']) {
    const v = vault(); const a = v.folder('A'), b = v.folder('B'); v.folder('Existing');
    const one = v.file('A/one.md'), two = v.file('B/two.md');
    await mergeFolders(v.app, [a, b], plan(path));
    assert.equal(one.path, `${path}/one.md`); assert.equal(two.path, `${path}/two.md`);
  }
});
test('rejects invalid or stale plans before even an external route moves', async () => {
  for (const variant of ['nested', 'ancestor', 'file', 'traversal', 'duplicate', 'stale', 'route']) {
    const v = vault(); const a = v.folder('A'), b = v.folder('B'), sub = v.folder('A/sub'), outside = v.folder('Outside');
    const note = v.file('A/note.md'); v.file('taken');
    let picked = [a, b], path = 'Combined', to = outside;
    if (variant === 'nested') path = 'A/sub/Combined';
    if (variant === 'ancestor') { picked = [sub, b]; path = 'A'; }
    if (variant === 'file') path = 'taken';
    if (variant === 'traversal') path = '../Combined';
    if (variant === 'duplicate') picked = [a, a];
    if (variant === 'stale') v.entries.delete('B');
    if (variant === 'route') to = sub;
    await assert.rejects(mergeFolders(v.app, picked, plan(path, new Map(), new Map([[note, to]]))));
    assert.equal(v.mutations.length, 0, variant);
  }
});
test('serializes merges per vault and releases the lock after a failure', async () => {
  const v = vault(); const a = v.folder('A'), b = v.folder('B');
  let release; const original = v.app.fileManager.renameFile;
  v.app.fileManager.renameFile = () => new Promise((_, reject) => { release = () => reject(new Error('disk error')); });
  const first = mergeFolders(v.app, [a, b], plan('Combined'));
  await assert.rejects(mergeFolders(v.app, [a, b], plan('Other')), /still running/);
  release(); await assert.rejects(first, /disk error/);
  v.app.fileManager.renameFile = original;
  await mergeFolders(v.app, [a, b], plan('Combined'));
});

// Every synthetic note carries distinct contents. Compare paths AND contents at each
// boundary, then compare all bytes independently of paths to detect overwrite/loss.
const inventory = (v) => Object.fromEntries([...v.entries]
  .filter(([, entry]) => entry instanceof TFile)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, entry]) => [path, entry.content]));
const allContents = (files) => Object.values(files).sort();
function assertInventory(v, before, expected) {
  assert.deepEqual(inventory(v), expected, 'every fixture has the expected path and exact contents');
  assert.deepEqual(allContents(inventory(v)), allContents(before), 'all original fixture contents survive exactly once');
  // Model consistency matters: a parent removed while it contains files could hide
  // data even if an orphan remains in the lookup map.
  for (const [path, entry] of v.entries) {
    assert.equal(entry.path, path);
    if (path === '/') continue;
    assert.equal(v.entries.get(entry.parent.path), entry.parent, `live parent for ${path}`);
    assert(entry.parent.children.includes(entry), `parent lists ${path}`);
  }
}
function failureReport(v, before, failed) {
  return (error) => {
    assert(error instanceof MergeFailure, 'runtime errors expose recovery information');
    assert.match(error.message, /synthetic (renameFile|trashFile) failure/);
    assert.equal(error.destination, 'Combined');
    // Bundled source runs in another VM realm; normalize only prototypes for comparison.
    const plain = (value) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(error.failed), failed);
    const completed = v.mutations.map(([kind, from, to]) => ({
      kind: kind === 'rename' ? 'move' : kind, from, ...(to ? { to } : {}),
    }));
    assert.deepEqual(plain(error.completed), completed, 'only acknowledged operations are reported completed');
    assert(!completed.some((operation) => JSON.stringify(operation) === JSON.stringify(failed)),
      'rejected operation is not reported as complete');
    const current = inventory(v);
    const expectedLocations = Object.entries(before)
      .filter(([path]) => path.startsWith('A/') || path.startsWith('B/'))
      .map(([from, content]) => ({ from, to: Object.entries(current).find(([, value]) => value === content)?.[0] ?? null }))
      .sort((a, b) => a.from.localeCompare(b.from));
    assert.deepEqual(plain(error.files).sort((a, b) => a.from.localeCompare(b.from)), expectedLocations,
      'report locates every original selected file including descendants of moved folders');
    assert(error.files.every(({ to }) => to !== null), 'no fixture is missing from the current host inventory');
    return true;
  };
}
function injectFailure(v, method, matches) {
  const original = v.app.fileManager[method];
  let calls = 0;
  v.app.fileManager[method] = async (item, destination) => {
    if (matches(item, destination)) {
      calls++;
      throw new Error(`synthetic ${method} failure at ${item.path}`);
    }
    return original(item, destination);
  };
  return () => {
    assert.equal(calls, 1, 'the intended failure boundary was reached once');
    v.app.fileManager[method] = original;
  };
}
function currentFolders(v, paths) {
  return paths.map((path) => {
    const folder = v.entries.get(path);
    assert(folder instanceof TFolder, `current folder exists: ${path}`);
    return folder;
  });
}

for (const mode of ['notes', 'folder']) {
  test(`${mode}: preserves a completed external route when the next source move fails, then safely replans`, async () => {
    const v = vault();
    const [a, b, outside] = ['A', 'B', 'Outside'].map(v.folder);
    const routed = v.file('A/route.md', 'route payload: moved before failure\n');
    v.file('Outside/route.md', 'outside payload: must never be overwritten\n');
    v.file('A/nested/Plan.md', 'A plan payload\n');
    v.file('A/nested/Plan 2.md', 'A numbered plan payload\n');
    v.file('B/nested/Plan.md', 'B colliding plan payload\n');
    const top = v.file('B/nested/top.md', 'route to new root payload\n');
    const before = inventory(v);
    const restore = injectFailure(v, 'renameFile', (item) => item === a);
    await assert.rejects(mergeFolders(v.app, [a, b], plan('Combined',
      new Map([[a, mode], [b, mode]]), new Map([[routed, outside], [top, null]]))),
      failureReport(v, before, { kind: 'move', from: 'A', to: mode === 'notes' ? 'Combined' : 'Combined/A' }));
    const intermediate = { ...before };
    delete intermediate['A/route.md'];
    intermediate['Outside/route 2.md'] = before['A/route.md'];
    if (mode === 'folder') {
      delete intermediate['B/nested/top.md'];
      intermediate['Combined/top.md'] = before['B/nested/top.md'];
    }
    assertInventory(v, before, intermediate);
    assert(v.entries.get('A').children.length > 0);
    assert(v.entries.get('B').children.length > 0);
    assert(!v.mutations.some(([kind]) => kind === 'trash'), 'no nonempty source was trashed');
    restore();

    // Rebuild selections and routes from current paths. The external route already
    // succeeded, so replaying the stale route is intentionally not part of recovery.
    const [currentA, currentB] = currentFolders(v, ['A', 'B']);
    const currentTop = v.entries.get('B/nested/top.md');
    const pendingRoutes = currentTop ? new Map([[currentTop, null]]) : new Map();
    await mergeFolders(v.app, [currentA, currentB], plan('Combined',
      new Map([[currentA, mode], [currentB, mode]]), pendingRoutes));
    const expected = {
      'Outside/route.md': before['Outside/route.md'],
      'Outside/route 2.md': before['A/route.md'],
      'Combined/top.md': before['B/nested/top.md'],
      [`Combined/${mode === 'folder' ? 'A/' : ''}nested/Plan.md`]: before['A/nested/Plan.md'],
      [`Combined/${mode === 'folder' ? 'A/' : ''}nested/Plan 2.md`]: before['A/nested/Plan 2.md'],
      [`Combined/${mode === 'folder' ? 'B/nested/Plan.md' : 'nested/Plan 3.md'}`]: before['B/nested/Plan.md'],
    };
    assertInventory(v, before, expected);
    assert(!v.entries.has('A') && !v.entries.has('B'));
  });
}

test('Notes: preserves earlier moves when a later nested collision fails and replans using the renamed lead', async () => {
  const v = vault(); const [a, b, outside] = ['A', 'B', 'Outside'].map(v.folder);
  v.file('A/nested/Plan.md', 'original A plan\n');
  v.file('A/nested/Plan 2.md', 'existing numbered A plan\n');
  const routed = v.file('A/route.md', 'external route completed\n');
  v.file('Outside/route.md', 'preexisting external note\n');
  v.file('B/early.md', 'early root move completed\n');
  v.file('B/nested/early.md', 'early nested move completed\n');
  v.file('B/nested/Plan.md', 'colliding B plan remains pending\n');
  v.file('B/pending.md', 'later root move remains pending\n');
  const before = inventory(v);
  const restore = injectFailure(v, 'renameFile', (item, destination) =>
    item.path === 'B/nested/Plan.md' && destination === 'Combined/nested/Plan 3.md');
  await assert.rejects(mergeFolders(v.app, [a, b], plan('Combined', new Map(), new Map([[routed, outside]]))),
    failureReport(v, before, { kind: 'move', from: 'B/nested/Plan.md', to: 'Combined/nested/Plan 3.md' }));
  const intermediate = {
    'Outside/route.md': before['Outside/route.md'],
    'Outside/route 2.md': before['A/route.md'],
    'Combined/nested/Plan.md': before['A/nested/Plan.md'],
    'Combined/nested/Plan 2.md': before['A/nested/Plan 2.md'],
    'Combined/early.md': before['B/early.md'],
    'Combined/nested/early.md': before['B/nested/early.md'],
    'B/nested/Plan.md': before['B/nested/Plan.md'],
    'B/pending.md': before['B/pending.md'],
  };
  assertInventory(v, before, intermediate);
  assert(!v.entries.has('A'), 'the lead folder was already renamed');
  assert(v.entries.get('B/nested').children.length > 0, 'failed nested source remains');
  assert(v.entries.get('B').children.length > 0, 'nonempty parent remains');
  restore();
  await mergeFolders(v.app, currentFolders(v, ['Combined', 'B']), plan('Combined'));
  const expected = { ...intermediate };
  delete expected['B/nested/Plan.md']; delete expected['B/pending.md'];
  expected['Combined/nested/Plan 3.md'] = before['B/nested/Plan.md'];
  expected['Combined/pending.md'] = before['B/pending.md'];
  assertInventory(v, before, expected);
  assert(!v.entries.has('B') && !v.entries.has('B/nested'));
});

test('Folder: preserves an earlier numbered folder move when a later folder collision fails', async () => {
  const v = vault(); const [a, b, outside] = ['A', 'B', 'Outside'].map(v.folder);
  v.file('Combined/A/sentinel.md', 'existing destination A\n');
  v.file('Combined/B/sentinel.md', 'existing destination B\n');
  v.file('A/nested/Plan.md', 'A nested payload\n');
  v.file('B/nested/Plan.md', 'B nested payload\n');
  const routed = v.file('B/route.md', 'route before folder moves\n');
  const before = inventory(v);
  const restore = injectFailure(v, 'renameFile', (item, destination) => item === b && destination === 'Combined/B 2');
  await assert.rejects(mergeFolders(v.app, [a, b], plan('Combined',
    new Map([[a, 'folder'], [b, 'folder']]), new Map([[routed, outside]]))),
    failureReport(v, before, { kind: 'move', from: 'B', to: 'Combined/B 2' }));
  const intermediate = {
    'Combined/A/sentinel.md': before['Combined/A/sentinel.md'],
    'Combined/B/sentinel.md': before['Combined/B/sentinel.md'],
    'Combined/A 2/nested/Plan.md': before['A/nested/Plan.md'],
    'B/nested/Plan.md': before['B/nested/Plan.md'],
    'Outside/route.md': before['B/route.md'],
  };
  assertInventory(v, before, intermediate);
  assert(v.entries.get('B').children.length > 0);
  assert(!v.mutations.some(([kind]) => kind === 'trash'));
  restore();
  const [target, pending] = currentFolders(v, ['Combined', 'B']);
  await mergeFolders(v.app, [target, pending], plan('Combined', new Map([[pending, 'folder']])));
  const expected = { ...intermediate };
  delete expected['B/nested/Plan.md'];
  expected['Combined/B 2/nested/Plan.md'] = before['B/nested/Plan.md'];
  assertInventory(v, before, expected);
  assert(!v.entries.has('B'));
});

for (const trashPath of ['B/nested', 'B']) {
  test(`Notes: preserves all contents after trash fails for emptied ${trashPath} and safely retries cleanup`, async () => {
    const v = vault(); const [a, b, outside] = ['A', 'B', 'Outside'].map(v.folder);
    v.file('A/nested/Plan.md', 'lead nested plan\n');
    v.file('A/nested/Plan 2.md', 'lead numbered plan\n');
    const routed = v.file('A/route.md', 'external payload already moved\n');
    v.file('Outside/route.md', 'preexisting external payload\n');
    v.file('B/nested/Plan.md', 'colliding nested payload already moved\n');
    v.file('B/later.md', 'later root payload\n');
    const before = inventory(v);
    const restore = injectFailure(v, 'trashFile', (item) => item.path === trashPath);
    await assert.rejects(mergeFolders(v.app, [a, b], plan('Combined',
      new Map(), new Map([[routed, outside]]))), failureReport(v, before, { kind: 'trash', from: trashPath }));
    const intermediate = {
      'Combined/nested/Plan.md': before['A/nested/Plan.md'],
      'Combined/nested/Plan 2.md': before['A/nested/Plan 2.md'],
      'Combined/nested/Plan 3.md': before['B/nested/Plan.md'],
      'Outside/route.md': before['Outside/route.md'],
      'Outside/route 2.md': before['A/route.md'],
      [trashPath === 'B/nested' ? 'B/later.md' : 'Combined/later.md']: before['B/later.md'],
    };
    assertInventory(v, before, intermediate);
    assert.equal(v.entries.get(trashPath).children.length, 0, 'failed trash leaves an empty folder');
    if (trashPath === 'B/nested') assert(v.entries.get('B').children.length > 0, 'pending file keeps its source parent');
    restore();
    await mergeFolders(v.app, currentFolders(v, ['Combined', 'B']), plan('Combined'));
    const expected = { ...intermediate };
    delete expected['B/later.md'];
    expected['Combined/later.md'] = before['B/later.md'];
    assertInventory(v, before, expected);
    assert(!v.entries.has('B') && !v.entries.has('B/nested'), 'retry completes empty-source cleanup');
  });
}

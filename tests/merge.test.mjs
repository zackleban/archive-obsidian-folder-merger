import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource, obsidian, TFolder, TFile } from './load-source.mjs';
const { mergeFolders, validFolderName } = await loadSource('src/merge.ts', obsidian);
function vault() {
  const root = new TFolder('/');
  const entries = new Map([['/', root]]);
  const mutations = [];
  const folder = (path) => {
    if (entries.has(path)) return entries.get(path);
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    const item = new TFolder(path, parent); entries.set(path, item); return item;
  };
  const file = (path) => {
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    const item = new TFile(path, parent); entries.set(path, item); return item;
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

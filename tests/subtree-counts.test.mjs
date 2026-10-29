import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadSource, obsidian, TFolder, TFile } from './load-source.mjs';

// Only calls made by the actual modal are measured. Fixture mutation/reference
// work is outside measure(). The raw adjacency map also bypasses the getters.
async function setup(t) {
  const dom = new JSDOM('<!doctype html><body></body>');
  t.after(() => dom.window.close());
  const { document, HTMLElement } = dom.window;
  let phase = null, counters = null, modal;
  const withPhase = (name, fn) => { const old = phase; phase = name; try { return fn(); } finally { phase = old; } };
  HTMLElement.prototype.createEl = function (tag, options = {}) {
    if (counters && modal?.listEl?.contains(this)) counters.domElements++;
    const el = document.createElement(tag); el.className = options.cls ?? '';
    for (const [k, v] of Object.entries(options.attr ?? {})) el.setAttribute(k, v);
    el.textContent = options.text ?? ''; this.append(el); return el;
  };
  HTMLElement.prototype.createDiv = function (o) { return this.createEl('div', o); };
  HTMLElement.prototype.createSpan = function (o) { return this.createEl('span', o); };
  HTMLElement.prototype.empty = function () { this.replaceChildren(); };
  HTMLElement.prototype.addClass = function (c) { this.classList.add(c); };
  HTMLElement.prototype.hasClass = function (c) { return this.classList.contains(c); };
  HTMLElement.prototype.toggleClass = function (c, b) { this.classList.toggle(c, b); };
  HTMLElement.prototype.setText = function (s) { this.textContent = s; };
  HTMLElement.prototype.setAttr = function (k, v) { this.setAttribute(k, v); };
  const entries = new Map(), raw = new Map(), rowFolders = new WeakMap();
  const instrument = f => {
    const children = f.children; raw.set(f, children);
    const proxy = new Proxy(children, { get(target, key, receiver) {
      if (counters && /^\d+$/.test(String(key))) counters[phase].visits++;
      return Reflect.get(target, key, receiver);
    } });
    Object.defineProperty(f, 'children', { get() { if (counters) counters[phase].reads++; return proxy; } });
    entries.set(f.path, f); return f;
  };
  const root = instrument(new TFolder('/'));
  const folder = path => {
    if (entries.has(path)) return entries.get(path);
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    return instrument(new TFolder(path, parent));
  };
  const file = path => {
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    const item = new TFile(path, parent); entries.set(path, item); return item;
  };
  const remove = item => {
    const siblings = raw.get(item.parent); siblings.splice(siblings.indexOf(item), 1);
    for (const [p, child] of [...entries]) if (p === item.path || p.startsWith(item.path + '/')) entries.delete(p);
  };
  const move = (item, path) => {
    const siblings = raw.get(item.parent); siblings.splice(siblings.indexOf(item), 1);
    item.parent = entries.get(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/');
    raw.get(item.parent).push(item);
    const old = item.path;
    for (const [p, child] of [...entries]) if (p === old || p.startsWith(old + '/')) {
      entries.delete(p); child.path = path + p.slice(old.length); entries.set(child.path, child);
    }
  };
  const app = { suggestions: [], loadLocalStorage() {}, saveLocalStorage() {}, vault: {
    getRoot: () => root, getName: () => 'Synthetic', getAllLoadedFiles: () => [...entries.values()],
    getAbstractFileByPath: path => entries.get(path) ?? null,
  } };
  class Modal {
    constructor(app) { this.app = app; this.modalEl = document.createElement('div'); this.titleEl = this.modalEl.createEl('h2'); this.contentEl = this.modalEl.createDiv(); }
    open() { document.body.append(this.modalEl); this.onOpen?.(); }
    close() { this.onClose?.(); this.modalEl.remove(); }
    onClose() {}
  }
  class FuzzySuggestModal extends Modal {
    setPlaceholder() {}
    onOpen() { this.items = this.getItems(); app.suggestions.push(this); }
  }
  const madeMaps = [];
  class ObservedMap extends Map { constructor(...args) { super(...args); if (phase === 'totals') madeMaps.push(this); } }
  const { MergeModal } = await loadSource(process.env.FOLDER_MERGER_COUNTS_SOURCE ?? 'src/modal.ts',
    { ...obsidian, Modal, FuzzySuggestModal, Notice: class {} }, { Map: ObservedMap });
  const open = (picked = []) => {
    modal = new MergeModal(app, picked);
    for (const [method, name] of [['renderList', 'enumeration'], ['renderRow', 'row'], ['collectFileTotals', 'totals']]) {
      if (!modal[method]) continue; // Old source has only per-row counts.
      const original = modal[method];
      modal[method] = function (...args) { return withPhase(name, () => {
        const result = original.apply(this, args);
        if (method === 'renderRow') rowFolders.set(this.listEl.lastElementChild, args[0]);
        return result;
      }); };
    }
    modal.open(); t.after(() => modal.close()); return modal;
  };
  const measure = action => {
    counters = { enumeration: { reads: 0, visits: 0 }, totals: { reads: 0, visits: 0 }, row: { reads: 0, visits: 0 }, preview: { reads: 0, visits: 0 }, domElements: 0 };
    try { withPhase('preview', action); return structuredClone(counters); } finally { counters = null; }
  };
  const expected = () => {
    const result = [];
    const walk = (f, level) => {
      for (const child of raw.get(f).filter(c => c instanceof TFolder)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))) {
        if (!modal.query || child.path.toLowerCase().includes(modal.query) || modal.picked.includes(child)) {
          // Independent path-based inventory reference; includes every nonfolder.
          const count = [...entries.values()].filter(c => !(c instanceof TFolder) && c.path.startsWith(child.path + '/')).length;
          result.push({ folder: child, count, level: modal.query ? 0 : level });
        }
        walk(child, level + 1);
      }
    };
    walk(root, 0); return result;
  };
  const verify = () => {
    const rows = [...modal.listEl.querySelectorAll('.folder-merger-row')], ref = expected();
    assert.equal(rows.length, ref.length);
    rows.forEach((row, i) => {
      const { folder: f, count, level } = ref[i], order = modal.picked.indexOf(f);
      const blocked = order < 0 && modal.picked.some(p => f.path.startsWith(p.path + '/') || p.path.startsWith(f.path + '/'));
      assert.equal(rowFolders.get(row), f, 'exact sorted row identity');
      assert.equal(row.querySelector('.folder-merger-count').textContent, String(count), f.path);
      assert.equal(row.style.getPropertyValue('--folder-merger-level'), String(level));
      assert.equal(row.classList.contains('is-picked'), order >= 0);
      assert.equal(row.classList.contains('is-blocked'), blocked);
      assert.equal(row.querySelector('input').checked, order >= 0);
      assert.equal(row.querySelector('input').disabled, blocked);
      assert.equal(row.querySelector('.folder-merger-order')?.textContent ?? null, order >= 0 ? String(order + 1) : null);
      assert.equal(row.querySelector('.folder-merger-kind .is-on')?.textContent ?? null,
        order >= 0 ? (modal.kinds.get(f) === 'folder' ? 'Folder' : 'Notes') : null);
      assert.equal(row.querySelector('.folder-merger-parent')?.textContent ?? null,
        (modal.query || order >= 0) && !f.parent.isRoot() ? `  ${f.parent.path}` : null);
    });
    assert.equal(Boolean(modal.listEl.querySelector('.folder-merger-empty')), ref.length === 0);
    return rows;
  };
  const size = () => ({ folders: [...entries.values()].filter(f => f instanceof TFolder).length, edges: entries.size - 1 });
  const input = (el, value) => { el.value = value; el.dispatchEvent(new dom.window.Event('input')); };
  return { app, root, raw, entries, folder, file, remove, move, open, measure, verify, size, input, madeMaps, rowFolders, dom };
}

const fixtures = [
  ...[64, 128, 256, 512].map(depth => [`chain-${depth}`, h => { let path = ''; for (let i = 0; i < depth; i++) path = path ? `${path}/d` : 'd'; h.file(`${path}/one.md`); }]),
  ['binary-8', h => { const build = (path, depth) => { if (!depth) { h.file(`${path}/leaf.md`); return; } for (const n of ['b', 'a']) build(path ? `${path}/${n}` : n, depth - 1); }; build('', 8); }],
  ['wide-512', h => { for (let i = 511; i >= 0; i--) { h.folder(`Folder ${i}`); if (i % 3 === 0) h.file(`Folder ${i}/image.png`); } }],
  ['mixed', h => { for (const p of ['z/empty', 'Alpha 10/nested/deep', 'alpha 2/shared/one', 'alpha 2/shared/two', 'alpha 2/empty']) h.folder(p); for (const p of ['root.md', 'Alpha 10/direct.md', 'Alpha 10/nested/file.pdf', 'Alpha 10/nested/deep/photo.png', 'alpha 2/shared/one/a', 'alpha 2/shared/two/sound.mp3']) h.file(p); }],
];
function bounded(h, work) {
  const { folders, edges } = h.size();
  assert.equal(work.enumeration.reads, folders, 'one folder enumeration per current folder');
  assert.equal(work.enumeration.visits, edges, 'one enumeration visit per current child');
  assert(work.totals.reads + work.row.reads <= folders, 'shared count traversal bounded by current folder count');
  assert(work.totals.visits + work.row.visits <= edges, 'shared count visits bounded by current child count');
  assert.equal(work.row.reads, 0, 'rows must not traverse subtrees');
}
for (const [name, build] of fixtures) {
  test(`${name}: actual list counts/order/state and repeated render controls`, async t => {
    const h = await setup(t); build(h); const m = h.open();
    for (let i = 0; i < 2; i++) {
      m.listEl.scrollTop = 137;
      const work = h.measure(() => m.renderList()); h.verify(); assert.equal(m.listEl.scrollTop, 137);
      assert.equal(work.domElements, (h.size().folders - 1) * 5, 'DOM allocation remains separate from count work');
      t.diagnostic(JSON.stringify({ fixture: name, render: i, ...h.size(), work }));
    }
  });
  test(`${name}: shared subtree work is linear per fresh list render`, async t => {
    const h = await setup(t); build(h); const m = h.open();
    for (let i = 0; i < 2; i++) { const work = h.measure(() => m.renderList()); h.verify(); bounded(h, work); }
  });
}

test('empty root, no matches, and all nonfolder children preserve count semantics', async t => {
  const h = await setup(t), m = h.open(); h.verify();
  const f = h.folder('Empty'); h.measure(() => m.renderList()); h.verify();
  const other = { path: 'Empty/abstract', parent: f, name: 'abstract' };
  h.raw.get(f).push(other); h.entries.set(other.path, other);
  h.measure(() => m.renderList()); h.verify();
  h.input(m.contentEl.querySelector('.folder-merger-search'), 'no-match'); h.verify();
});

test('selected/filter/mode callbacks preserve order, blocking, parents and scroll', async t => {
  const h = await setup(t); fixtures.at(-1)[1](h);
  const a = h.entries.get('alpha 2/shared/one'), b = h.entries.get('Alpha 10');
  const m = h.open([a, b]); h.verify(); m.listEl.scrollTop = 81;
  let rows = h.verify(); rows.find(r => h.rowFolders.get(r) === a).querySelector('button').click();
  assert.equal(m.kinds.get(a), 'folder'); assert.equal(m.listEl.scrollTop, 81); h.verify();
  h.input(m.contentEl.querySelector('.folder-merger-search'), 'Z/EMPTY');
  rows = h.verify(); assert.equal(rows.length, 3); assert.deepEqual(rows.map(r => h.rowFolders.get(r).path), ['alpha 2/shared/one', 'Alpha 10', 'z/empty']);
  const box = rows.find(r => h.rowFolders.get(r) === a).querySelector('input'); box.checked = false; box.dispatchEvent(new h.dom.window.Event('change'));
  assert.deepEqual(Array.from(m.picked), [b]); assert(!m.kinds.has(a)); h.verify();
  h.input(m.contentEl.querySelector('.folder-merger-search'), ''); h.verify();
});

test('add/remove/rename/move files and folders refresh totals without historical aggregate ownership', async t => {
  const h = await setup(t); h.file('A/nested/one.md'); h.file('B/two.pdf'); const m = h.open();
  const ownKeys = Object.keys(m);
  const refresh = () => { const work = h.measure(() => m.renderList()); h.verify(); return work; };
  refresh(); h.file('A/direct.png'); refresh(); h.file('A/empty/deep/three.mp3'); refresh();
  h.remove(h.entries.get('A/nested/one.md')); refresh();
  h.move(h.entries.get('A/direct.png'), 'B/renamed.png'); refresh();
  h.move(h.entries.get('A/empty'), 'B/moved'); refresh();
  h.move(h.entries.get('B/moved'), 'B/renamed-folder'); refresh();
  for (let i = 0; i < 40; i++) {
    const old = h.folder('Transient/deep'); h.file('Transient/deep/temp.md'); refresh();
    const retired = h.entries.get('Transient'); h.remove(retired); refresh();
    // Same paths, fresh identities: a historical path-keyed total must not survive.
    h.folder('Transient/deep'); refresh(); h.remove(h.entries.get('Transient')); refresh();
    assert(!h.madeMaps.at(-1)?.has(old)); assert(!h.madeMaps.at(-1)?.has(retired));
  }
  assert.deepEqual(Object.keys(m), ownKeys, 'no retained aggregate field');
  for (const map of h.madeMaps) assert(!Object.values(m).includes(map), 'no modal-owned totals map');
  if (h.madeMaps.length) {
    assert.equal(h.madeMaps.at(-1).size, h.size().folders);
    assert.notEqual(h.madeMaps.at(-1), h.madeMaps.at(-2), 'fresh render-local map');
  }
});

test('search keeps displayed intent/suggestion; name/depth renders retire suggestions and update counts', async t => {
  const h = await setup(t); const a = h.folder('Parent/A'), b = h.folder('Parent/B');
  h.file('Parent/A/one.md'); h.file('Parent/B/two.md'); h.folder('Elsewhere');
  const m = h.open([a, b]); h.input(m.nameInput, 'Combined');
  m.routesEl.querySelector('.folder-merger-dest').click();
  const suggestion = m.suggestion, shown = m.displayed, revision = m.revision;
  h.file('Parent/A/new.png');
  h.measure(() => h.input(m.contentEl.querySelector('.folder-merger-search'), 'elsewhere')); h.verify();
  assert.equal(m.revision, revision); assert.equal(m.displayed, shown); assert.equal(m.suggestion, suggestion);
  assert.equal(m.intentCurrent(), true, 'unrouted inventory is not frozen');
  const work = h.measure(() => h.input(m.nameInput, 'Renamed')); h.verify();
  assert.equal(m.suggestion, null); assert.equal(m.revision, revision + 1); assert.notEqual(m.displayed, shown);
  assert.equal(m.displayed.plan.path, 'Parent/Renamed'); assert.match(m.noteEl.textContent, /^3 files/);
  t.diagnostic(JSON.stringify({ action: 'name-input', work, note: 'preview reads include unchanged routes and selected-folder summary' }));
  const before = m.revision; h.measure(() => m.outEl.click()); h.verify();
  assert.equal(m.revision, before + 1); assert.equal(m.displayed.plan.path, 'Renamed');
});

test('changing selected and filtered trees retain linear count work at every render boundary', async t => {
  const h = await setup(t); const a = h.folder('Parent/A'), b = h.folder('Parent/B');
  h.file('Parent/A/one.md'); h.file('Parent/B/two.png'); const m = h.open([a, b]);
  const check = action => { const work = h.measure(action); h.verify(); bounded(h, work); };
  check(() => m.renderList());
  h.file('Parent/A/nested/added.pdf'); check(() => m.renderList());
  h.move(h.entries.get('Parent/A/nested'), 'Parent/B/moved'); check(() => m.renderList());
  h.move(h.entries.get('Parent/B/moved/added.pdf'), 'Parent/A/renamed.mp3'); check(() => m.renderList());
  h.remove(h.entries.get('Parent/A/renamed.mp3')); check(() => m.renderList());
  for (let i = 0; i < 20; i++) {
    const f = h.folder('Transient'); h.file('Transient/one.md'); check(() => m.renderList());
    h.remove(f); h.folder('Transient'); check(() => m.renderList());
    h.remove(h.entries.get('Transient')); check(() => m.renderList());
  }
  check(() => h.input(m.contentEl.querySelector('.folder-merger-search'), 'missing'));
  assert.equal(h.verify().length, 2, 'selected rows survive a nonmatching query');
  check(() => h.input(m.nameInput, 'Combined'));
  check(() => m.outEl.click());
  check(() => m.listEl.querySelector('.is-picked button').click());
  check(() => h.input(m.contentEl.querySelector('.folder-merger-search'), ''));
});

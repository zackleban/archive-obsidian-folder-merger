import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadSource, obsidian, TFolder, TFile } from './load-source.mjs';

// Actual main -> modal -> merge in one bundle (including the shared per-App lock).
// Native DOM events; explicit host lifecycle, suggestion and vault doubles.
async function setup(t) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const { document, HTMLElement, EventTarget } = dom.window;
  const callbacks = new WeakMap(), nativeAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (name, fn, options) {
    if (!callbacks.has(this)) callbacks.set(this, new Map());
    callbacks.get(this).set(name, fn); return nativeAdd.call(this, name, fn, options);
  };
  HTMLElement.prototype.createEl = function (tag, options = {}) {
    const el = document.createElement(tag); el.className = options.cls ?? '';
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
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
  const root = new TFolder('/'), entries = new Map([['/', root]]), operations = [], notices = [];
  const folder = path => {
    if (entries.has(path)) return entries.get(path);
    const parent = path.includes('/') ? folder(path.slice(0, path.lastIndexOf('/'))) : root;
    const item = new TFolder(path, parent); entries.set(path, item); return item;
  };
  const file = (path, content = `bytes:${path}`) => {
    const item = new TFile(path, folder(path.slice(0, path.lastIndexOf('/'))));
    item.content = content; entries.set(path, item); return item;
  };
  const move = (item, path) => {
    assert(!entries.has(path), `no overwrite ${path}`);
    item.parent.children.splice(item.parent.children.indexOf(item), 1);
    item.parent = entries.get(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/');
    assert(item.parent instanceof TFolder); item.parent.children.push(item);
    const old = item.path;
    for (const [key, value] of [...entries]) if (key === old || key.startsWith(old + '/')) {
      entries.delete(key); value.path = path + key.slice(old.length); entries.set(value.path, value);
    }
  };
  const remove = item => {
    item.parent.children.splice(item.parent.children.indexOf(item), 1);
    for (const key of [...entries.keys()]) if (key === item.path || key.startsWith(item.path + '/')) entries.delete(key);
  };
  const app = {
    opened: [], suggestions: [], loadLocalStorage() {}, saveLocalStorage() {},
    workspace: { on() { return {}; }, onLayoutReady() {}, getLeavesOfType() { return []; } },
    vault: {
      getRoot: () => root, getName: () => 'Synthetic', getAllLoadedFiles: () => [...entries.values()],
      getAbstractFileByPath: path => entries.get(path) ?? null,
      async createFolder(path) { operations.push(['create', path]); return folder(path); },
    },
    fileManager: {
      async renameFile(item, path) { operations.push(['move', item.path, path]); move(item, path); },
      async trashFile(item) { operations.push(['trash', item.path]); assert.equal(item.children.length, 0); remove(item); },
    },
  };
  class Modal {
    constructor(app) {
      this.app = app; this.modalEl = document.createElement('div');
      this.titleEl = this.modalEl.createEl('h2'); this.contentEl = this.modalEl.createDiv();
    }
    open() { this.opened = true; document.body.append(this.modalEl); app.opened.push(this); this.onOpen?.(); }
    close() { this.opened = false; this.onClose?.(); this.modalEl.remove(); }
    onOpen() {}
    onClose() {}
  }
  class FuzzySuggestModal extends Modal {
    setPlaceholder() {}
    onOpen() { this.items = this.getItems(); app.suggestions.push(this); }
    // Deliberately close-before-delivery host double. Candidate owns the public
    // selectSuggestion boundary, avoiding reliance on inherited callback order.
    selectSuggestion(value, evt) { this.close(); this.onChooseItem(value.item, evt); }
  }
  class Plugin { constructor(app) { this.app = app; } addCommand() {} registerEvent() {} }
  const { default: Merger } = await loadSource(process.env.FOLDER_MERGER_INTENT_SOURCE ?? 'src/main.ts', {
    ...obsidian, Modal, FuzzySuggestModal, Plugin, Notice: class { constructor(message) { notices.push(message); } },
  }, { console: { error() {} } });
  const plugin = new Merger(app); plugin.onload();
  t.after(() => { plugin.onunload(); dom.window.close(); });
  const input = (el, value) => { el.value = value; el.dispatchEvent(new dom.window.Event('input')); };
  const open = (picked = [a, b], name = 'Combined') => {
    plugin.open(picked); const modal = app.opened.at(-1); input(modal.nameInput, name); return modal;
  };
  const retain = (modal, path = 'button') => {
    const el = path === 'button' ? modal.mergeEl : modal.nameInput;
    const fn = callbacks.get(el).get(path === 'button' ? 'click' : 'keydown');
    return () => fn({ key: 'Enter' });
  };
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
  const confirm = async (modal, path = 'button') => {
    if (path === 'button') modal.mergeEl.click();
    else modal.nameInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
  };
  const inventory = () => Object.fromEntries([...entries].filter(([, f]) => f instanceof TFile)
    .sort(([a], [b]) => a.localeCompare(b)).map(([p, f]) => [p, f.content]));
  const route = (modal, index = 0) => {
    modal.routesEl.querySelectorAll('.folder-merger-dest')[index].click(); return app.suggestions.at(-1);
  };
  const choose = (suggest, target) => {
    const item = suggest.items.find(i => i.to === target); assert(item, 'offered choice');
    suggest.selectSuggestion({ item }, new dom.window.MouseEvent('click')); return item;
  };
  const mode = (modal, folder, kind) => {
    const index = modal.picked.indexOf(folder);
    modal.listEl.querySelectorAll('.is-picked .folder-merger-kind')[index]
      .querySelectorAll('button')[kind === 'folder' ? 0 : 1].click();
  };
  const a = folder('Parent/A'), b = folder('Parent/B'), outside = folder('Outside');
  const one = file('Parent/A/one.md'), two = file('Parent/B/two.md');
  return { app, plugin, a, b, one, two, outside, entries, operations, notices, folder, file, move, remove,
    open, input, retain, settle, confirm, inventory, route, choose, mode, callbacks };
}
const expected = { 'Parent/Combined/one.md': 'bytes:Parent/A/one.md', 'Parent/Combined/two.md': 'bytes:Parent/B/two.md' };
const notesOps = [['move', 'Parent/A', 'Parent/Combined'], ['move', 'Parent/B/two.md', 'Parent/Combined/two.md'], ['trash', 'Parent/B']];

for (const path of ['button', 'Enter']) {
  test(`${path}: unchanged displayed plan executes exact moves and preserves bytes`, async t => {
    const h = await setup(t), m = h.open(); assert.equal(m.pathEl.textContent, 'Synthetic›Parent›Combined');
    await h.confirm(m, path); assert.deepEqual(h.operations, notesOps); assert.deepEqual(h.inventory(), expected);
  });
  for (const variant of ['ancestor rename', 'ancestor move', 'source rename', 'source replacement', 'source deletion',
    'target appears', 'target file appears', 'target replacement', 'target deletion', 'parent replacement',
    'routed file rename', 'routed file replacement', 'route destination rename', 'route destination replacement', 'route destination deletion']) {
    test(`${path}: refuses ${variant} before any merge mutation`, async t => {
      const h = await setup(t);
      if (variant.startsWith('target replacement') || variant === 'target deletion') h.folder('Parent/Combined');
      const m = h.open();
      if (variant.startsWith('route') || variant.startsWith('routed')) h.choose(h.route(m), h.outside);
      const preview = { destination: m.pathEl.textContent, inventory: m.routesEl.textContent };
      if (variant === 'ancestor rename') h.move(h.entries.get('Parent'), 'MovedParent');
      if (variant === 'ancestor move') { h.folder('Elsewhere'); h.move(h.entries.get('Parent'), 'Elsewhere/Parent'); }
      if (variant === 'source rename') h.move(h.a, 'Parent/Renamed');
      if (variant === 'source replacement') { h.remove(h.a); h.folder('Parent/A'); h.file('Parent/A/replacement.md'); }
      if (variant === 'source deletion') h.remove(h.b);
      if (variant === 'target appears') h.folder('Parent/Combined');
      if (variant === 'target file appears') h.file('Parent/Combined');
      if (variant === 'target replacement') { h.remove(h.entries.get('Parent/Combined')); h.folder('Parent/Combined'); }
      if (variant === 'target deletion') h.remove(h.entries.get('Parent/Combined'));
      if (variant === 'parent replacement') {
        const old = h.entries.get('Parent'), next = new TFolder('Parent', h.entries.get('/'));
        next.children = old.children; next.children.forEach(c => c.parent = next); h.entries.set('Parent', next);
        old.parent.children.splice(old.parent.children.indexOf(old), 1);
      }
      if (variant === 'routed file rename') h.move(h.one, 'Parent/A/renamed.md');
      if (variant === 'routed file replacement') { h.remove(h.one); h.file('Parent/A/one.md', 'replacement'); }
      if (variant === 'route destination rename') h.move(h.outside, 'Elsewhere');
      if (variant === 'route destination replacement') { h.remove(h.outside); h.folder('Outside'); }
      if (variant === 'route destination deletion') h.remove(h.outside);
      const before = h.inventory(); await h.confirm(m, path);
      if (variant === 'ancestor rename') t.diagnostic(JSON.stringify({ preview, invoked: path, operations: h.operations, final: h.inventory() }));
      assert.deepEqual(h.operations, []); assert.deepEqual(h.inventory(), before);
      assert.equal(m.opened, false); assert.match(h.notices.at(-1), /out of date.*[Rr]eopen/);
    });
  }
  for (const close of ['cancel', 'external close', 'plugin unload']) {
    test(`${path}: explicit retained callback after ${close} is powerless`, async t => {
      const h = await setup(t), m = h.open(), callback = h.retain(m, path), before = h.inventory();
      const preview = m.pathEl.textContent;
      if (close === 'cancel') [...m.contentEl.querySelectorAll('button')].find(b => b.textContent === 'Cancel').click();
      if (close === 'external close') m.close();
      if (close === 'plugin unload') h.plugin.onunload();
      callback(); await h.settle();
      t.diagnostic(JSON.stringify({ preview, invoked: `retained ${path} after ${close}`, operations: h.operations, final: h.inventory() }));
      assert.deepEqual(h.operations, []); assert.deepEqual(h.inventory(), before);
    });
  }
}

test('fresh deliberate prompt after stale rejection executes reviewed destination', async t => {
  const h = await setup(t), m = h.open(); h.move(h.entries.get('Parent'), 'MovedParent');
  await h.confirm(m); assert.deepEqual(h.operations, []);
  const fresh = h.open(); assert.equal(fresh.pathEl.textContent, 'Synthetic›MovedParent›Combined');
  await h.confirm(fresh);
  assert.deepEqual(h.operations, notesOps.map(op => op.map(s => s.replaceAll('Parent/', 'MovedParent/'))));
  assert.deepEqual(h.inventory(), Object.fromEntries(Object.entries(expected).map(([p, b]) => [p.replace('Parent/', 'MovedParent/'), b])));
});

test('current un-routed inventory/content and current collisions are allowed', async t => {
  const h = await setup(t); h.folder('Parent/Combined'); const m = h.open();
  h.one.content = 'edited while open'; h.remove(h.two); h.file('Parent/B/new.md', 'new contents');
  h.file('Parent/Combined/one.md', 'existing collision');
  await h.confirm(m);
  assert.deepEqual(h.operations, [['move', 'Parent/A/one.md', 'Parent/Combined/one 2.md'], ['trash', 'Parent/A'],
    ['move', 'Parent/B/new.md', 'Parent/Combined/new.md'], ['trash', 'Parent/B']]);
  assert.deepEqual(h.inventory(), { 'Parent/Combined/new.md': 'new contents', 'Parent/Combined/one 2.md': 'edited while open', 'Parent/Combined/one.md': 'existing collision' });
});

test('reviewed Folder choices, external and root routes execute exact effects', async t => {
  const h = await setup(t), m = h.open(); h.mode(m, h.a, 'folder'); h.mode(m, h.b, 'folder');
  h.choose(h.route(m, 0), h.outside); h.choose(h.route(m, 1), null);
  await h.confirm(m, 'Enter');
  assert.deepEqual(h.operations, [['move', 'Parent/A/one.md', 'Outside/one.md'], ['create', 'Parent/Combined'],
    ['move', 'Parent/B/two.md', 'Parent/Combined/two.md'], ['move', 'Parent/A', 'Parent/Combined/A'], ['move', 'Parent/B', 'Parent/Combined/B']]);
  assert.deepEqual(h.inventory(), { 'Outside/one.md': 'bytes:Parent/A/one.md', 'Parent/Combined/two.md': 'bytes:Parent/B/two.md' });
});

test('independent retained prompts: closing one does not invalidate another', async t => {
  const h = await setup(t), first = h.open(), second = h.open(); first.close();
  await h.confirm(second); assert.deepEqual(h.operations, notesOps); assert.deepEqual(h.inventory(), expected);
});

test('independent retained prompts: consuming one leaves a disjoint plan valid', async t => {
  const h = await setup(t); const c = h.folder('Other/C'), d = h.folder('Other/D'); h.file('Other/C/c.md'); h.file('Other/D/d.md');
  const first = h.open(), second = h.open([c, d]); await h.confirm(first); await h.confirm(second);
  assert.deepEqual(h.operations, [...notesOps, ['move', 'Other/C', 'Other/Combined'], ['move', 'Other/D/d.md', 'Other/Combined/d.md'], ['trash', 'Other/D']]);
  assert.deepEqual(h.inventory(), { ...expected, 'Other/Combined/c.md': 'bytes:Other/C/c.md', 'Other/Combined/d.md': 'bytes:Other/D/d.md' });
});

for (const variant of ['parent closed', 'parent changed', 'file moved', 'destination moved', 'suggestion cancelled', 'older row callback', 'older suggestion']) {
  test(`obsolete route choice: ${variant}`, async t => {
    const h = await setup(t), m = h.open(), row = m.routesEl.querySelector('.folder-merger-dest');
    const oldRow = h.callbacks.get(row).get('click'); const s = h.route(m); const item = s.items.find(i => i.to === h.outside);
    if (variant === 'parent closed') m.close();
    if (variant === 'parent changed' || variant === 'older row callback') h.input(m.nameInput, 'Reviewed');
    if (variant === 'file moved') h.move(h.one, 'Parent/A/renamed.md');
    if (variant === 'destination moved') h.move(h.outside, 'MovedOutside');
    if (variant === 'suggestion cancelled') s.close();
    if (variant === 'older suggestion') h.route(m, 1);
    const before = h.inventory(), count = h.app.suggestions.length;
    if (variant === 'older row callback') oldRow();
    else s.onChooseItem(item); // Explicit retained callback, beyond normal lifecycle.
    await h.settle();
    assert.equal(m.routes.size, 0); assert.deepEqual(h.operations, []); assert.deepEqual(h.inventory(), before);
    if (variant === 'older row callback') assert.equal(h.app.suggestions.length, count);
  });
}

test('repeat confirmation and close after execution begins do not restart or roll back', async t => {
  const h = await setup(t), m = h.open(), retained = h.retain(m);
  const original = h.app.fileManager.renameFile; let release;
  h.app.fileManager.renameFile = async (item, path) => {
    if (!release) await new Promise(resolve => { release = resolve; });
    return original(item, path);
  };
  retained(); retained(); assert(release); m.close(); retained(); release(); await h.settle(); retained(); await h.settle();
  assert.deepEqual(h.operations, notesOps); assert.deepEqual(h.inventory(), expected);
});

test('per-App lock through real modals rejects another valid plan; fresh recovery works', async t => {
  const h = await setup(t), m = h.open(), other = h.open();
  const original = h.app.fileManager.renameFile; let release;
  h.app.fileManager.renameFile = () => new Promise((_, reject) => { release = () => reject(new Error('injected start failure')); });
  h.retain(m)(); await h.confirm(other); assert.match(h.notices.at(-1), /Another folder merge is still running/);
  assert.deepEqual(h.operations, []); release(); await h.settle();
  const report = h.app.opened.at(-1).contentEl.querySelector('textarea').value;
  assert.match(report, /None acknowledged/); assert.match(report, /UNCHANGED: Parent\/A\/one.md/);
  h.app.fileManager.renameFile = original; await h.confirm(h.open());
  assert.deepEqual(h.operations, notesOps); assert.deepEqual(h.inventory(), expected);
});

for (const path of ['button', 'Enter']) {
  test(`${path}: obsolete all-Folder plan refuses create and external routes`, async t => {
    const h = await setup(t), m = h.open(); h.mode(m, h.a, 'folder'); h.mode(m, h.b, 'folder');
    h.choose(h.route(m), h.outside); h.move(h.entries.get('Parent'), 'MovedParent');
    const before = h.inventory(); await h.confirm(m, path);
    assert.deepEqual(h.operations, []); assert.deepEqual(h.inventory(), before);
  });
}

test('selected existing destination is preserved through a real modal confirmation', async t => {
  const h = await setup(t), m = h.open([h.a, h.b], 'A');
  assert.equal(m.pathEl.textContent, 'Synthetic›Parent›A'); await h.confirm(m);
  assert.deepEqual(h.operations, [['move', 'Parent/B/two.md', 'Parent/A/two.md'], ['trash', 'Parent/B']]);
  assert.equal(h.entries.get('Parent/A'), h.a);
  assert.deepEqual(h.inventory(), { 'Parent/A/one.md': 'bytes:Parent/A/one.md', 'Parent/A/two.md': 'bytes:Parent/B/two.md' });
});

test('new destination occupancy rejects; fresh reviewed existing destination accepts', async t => {
  const h = await setup(t), m = h.open(); h.folder('Parent/Combined'); h.file('Parent/Combined/one.md', 'keep');
  await h.confirm(m); assert.deepEqual(h.operations, []);
  const fresh = h.open(); assert.match(fresh.noteEl.textContent, /folder already there/); await h.confirm(fresh);
  assert.deepEqual(h.operations, [['move', 'Parent/A/one.md', 'Parent/Combined/one 2.md'], ['trash', 'Parent/A'],
    ['move', 'Parent/B/two.md', 'Parent/Combined/two.md'], ['trash', 'Parent/B']]);
  assert.deepEqual(h.inventory(), { 'Parent/Combined/one 2.md': 'bytes:Parent/A/one.md', 'Parent/Combined/one.md': 'keep', 'Parent/Combined/two.md': 'bytes:Parent/B/two.md' });
});

test('deliberately reviewed name, depth and mixed modes remain usable', async t => {
  const h = await setup(t), m = h.open(); h.mode(m, h.b, 'folder'); h.input(m.nameInput, 'Reviewed'); m.topEl.click();
  assert.equal(m.pathEl.textContent, 'Synthetic›Reviewed'); await h.confirm(m, 'Enter');
  assert.deepEqual(h.operations, [['move', 'Parent/A', 'Reviewed'], ['move', 'Parent/B', 'Reviewed/B']]);
  assert.deepEqual(h.inventory(), { 'Reviewed/one.md': 'bytes:Parent/A/one.md', 'Reviewed/B/two.md': 'bytes:Parent/B/two.md' });
});

for (const variant of ['existing destination moved', 'root routed file renamed', 'routed file removed', 'routed file moved out']) {
  test(`additional identity boundary: ${variant}`, async t => {
    const h = await setup(t); if (variant === 'existing destination moved') h.folder('Parent/Combined');
    const m = h.open();
    if (variant !== 'existing destination moved') h.choose(h.route(m), null);
    if (variant === 'existing destination moved') h.move(h.entries.get('Parent/Combined'), 'Elsewhere');
    if (variant === 'root routed file renamed') h.move(h.one, 'Parent/A/new.md');
    if (variant === 'routed file removed') h.remove(h.one);
    if (variant === 'routed file moved out') h.move(h.one, 'Outside/one.md');
    const before = h.inventory(); await h.confirm(m); assert.deepEqual(h.operations, []); assert.deepEqual(h.inventory(), before);
  });
}

test('current routed content edits retain identity and valid route; root-vault route works', async t => {
  const h = await setup(t), m = h.open(); h.choose(h.route(m), h.entries.get('/')); h.one.content = 'edited routed contents';
  await h.confirm(m);
  assert.deepEqual(h.operations, [['move', 'Parent/A/one.md', 'one.md'], ...notesOps]);
  assert.deepEqual(h.inventory(), { 'one.md': 'edited routed contents', 'Parent/Combined/two.md': 'bytes:Parent/B/two.md' });
});

test('route reset and return-to-default choices preserve a valid freshly rendered plan', async t => {
  const h = await setup(t), m = h.open(); h.choose(h.route(m), h.outside);
  m.routesEl.querySelector('.folder-merger-reset').click(); assert.equal(m.routes.size, 0);
  h.choose(h.route(m), null); h.choose(h.route(m), undefined); assert.equal(m.routes.size, 0);
  await h.confirm(m); assert.deepEqual(h.operations, notesOps); assert.deepEqual(h.inventory(), expected);
});

for (const variant of ['cancel', 'parent close', 'unload', 'repeated choice', 'items refreshed', 'destination replaced']) {
  test(`public suggestion selection cannot regain authority after ${variant}`, async t => {
    const h = await setup(t), m = h.open(), s = h.route(m), item = s.items.find(i => i.to === h.outside);
    if (variant === 'cancel') s.close();
    if (variant === 'parent close') m.close();
    if (variant === 'unload') h.plugin.onunload();
    if (variant === 'repeated choice') { h.choose(s, null); }
    if (variant === 'items refreshed') s.getItems();
    if (variant === 'destination replaced') { h.remove(h.outside); h.folder('Outside'); }
    const routes = [...m.routes], before = h.inventory();
    s.selectSuggestion({ item }, {}); await h.settle();
    assert.deepEqual([...m.routes], routes); assert.deepEqual(h.operations, []); assert.deepEqual(h.inventory(), before);
  });
}

test('later partial failure through modal preserves report and deliberate one-source recovery', async t => {
  const h = await setup(t), m = h.open();
  const original = h.app.fileManager.renameFile;
  h.app.fileManager.renameFile = async (item, path) => { if (item === h.two) throw new Error('injected later failure'); return original(item, path); };
  await h.confirm(m);
  assert.deepEqual(h.operations, [notesOps[0]]);
  assert.deepEqual(h.inventory(), { 'Parent/Combined/one.md': 'bytes:Parent/A/one.md', 'Parent/B/two.md': 'bytes:Parent/B/two.md' });
  const report = h.app.opened.at(-1).contentEl.querySelector('textarea').value;
  assert.match(report, /move: Parent\/A → Parent\/Combined/);
  assert.match(report, /Failed operation: move: Parent\/B\/two.md → Parent\/Combined\/two.md/);
  assert.match(report, /MOVED: Parent\/A\/one.md → Parent\/Combined\/one.md/);
  assert.match(report, /UNCHANGED: Parent\/B\/two.md/);
  h.app.fileManager.renameFile = original; const retry = h.open([h.entries.get('Parent/Combined'), h.b]);
  await h.confirm(retry); assert.deepEqual(h.operations, notesOps); assert.deepEqual(h.inventory(), expected);
});

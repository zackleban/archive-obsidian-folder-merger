import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadSource, obsidian, TFolder, TFile } from './load-source.mjs';

const BUTTON = '.folder-merger-button';

// Native synthetic DOM and dispatch, not a copy of the ownership implementation.
// Actual main.ts and MergeModal constructor/onClose run. Modal.open deliberately
// stops before onOpen: rendering, merge execution and real host lifecycle are not
// established here. The existing recovery suite exercises the modal UI separately.
async function setup(t, { ready = true } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const { document } = dom.window;
  const listeners = new WeakMap(), retainedClicks = new WeakMap();
  const nativeAdd = dom.window.EventTarget.prototype.addEventListener;
  const nativeRemove = dom.window.EventTarget.prototype.removeEventListener;
  dom.window.EventTarget.prototype.addEventListener = function (name, fn, options) {
    if (name === 'click') {
      if (!listeners.has(this)) listeners.set(this, new Set());
      listeners.get(this).add(fn);
      if (!retainedClicks.has(this)) retainedClicks.set(this, []);
      retainedClicks.get(this).push(fn);
    }
    return nativeAdd.call(this, name, fn, options);
  };
  dom.window.EventTarget.prototype.removeEventListener = function (name, fn, options) {
    if (name === 'click') listeners.get(this)?.delete(fn);
    return nativeRemove.call(this, name, fn, options);
  };
  dom.window.HTMLElement.prototype.createEl = function (tag, options = {}) {
    const el = this.ownerDocument.createElement(tag);
    el.className = options.cls ?? '';
    for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
    if (options.text) el.textContent = options.text;
    this.append(el); return el;
  };
  dom.window.HTMLElement.prototype.empty = function () { this.replaceChildren(); };
  const active = new Map(), retainedEvents = [], layoutReady = [], instances = [];
  let leaves = [];
  const app = {
    opened: [],
    workspace: {
      on(name, fn) {
        if (!active.has(name)) active.set(name, new Set());
        active.get(name).add(fn); retainedEvents.push({ name, fn });
        return { off: () => active.get(name).delete(fn) };
      },
      getLeavesOfType(type) { assert.equal(type, 'file-explorer'); return leaves; },
      onLayoutReady(fn) { layoutReady.push(fn); if (ready) fn(); },
    },
  };
  class Plugin {
    constructor(app) { this.app = app; this.disposers = []; this.commands = []; }
    addCommand(command) { this.commands.push(command); }
    register(fn) { this.disposers.push(fn); }
    registerEvent(ref) { this.register(() => ref.off()); }
    registerDomEvent(el, name, fn, options) {
      el.addEventListener(name, fn, options);
      this.register(() => el.removeEventListener(name, fn, options));
    }
  }
  class Modal {
    constructor(app) { this.app = app; this.contentEl = document.createElement('div'); this.closeCount = 0; }
    open() { this.opened = true; this.contentEl.textContent = 'controlled modal boundary'; app.opened.push(this); }
    close() { this.opened = false; this.closeCount++; this.onClose?.(); }
  }
  const { default: Merger } = await loadSource(process.env.FOLDER_MERGER_SOURCE ?? 'src/main.ts', {
    ...obsidian, Plugin, Modal, FuzzySuggestModal: Modal,
    setIcon(el, name) { assert.equal(name, 'folder'); el.dataset.icon = name; },
  });
  function emit(name, ...args) { for (const fn of active.get(name) ?? []) fn(...args); }
  function enable() { const p = new Merger(app); instances.push(p); p.onload(); return p; }
  function disable(p) { p.onunload(); for (const off of p.disposers.splice(0)) off(); }
  function pane({ connected = true, toolbar = true } = {}) {
    const containerEl = document.createElement('div');
    if (connected) document.body.append(containerEl);
    const bar = toolbar ? containerEl.createEl('div', { cls: 'nav-buttons-container' }) : null;
    const leaf = { view: { containerEl } }; leaves.push(leaf);
    return { leaf, container: containerEl, bar };
  }
  t.after(() => { instances.forEach(disable); dom.window.close(); });
  return {
    app, document, pane, enable, disable, emit, layoutReady, retainedEvents,
    layout: () => emit('layout-change'),
    removeLeaf(pane) { leaves = leaves.filter(leaf => leaf !== pane.leaf); },
    duplicateLeaf(pane) { leaves.push(pane.leaf); },
    listenerCount: button => listeners.get(button)?.size ?? 0,
    callbacks: button => retainedClicks.get(button) ?? [],
    click(button) { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); },
    activeEvents: () => [...active.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

function owned(p, bars) {
  const buttons = bars.map(bar => {
    const nodes = [...bar.querySelectorAll(BUTTON)];
    assert.equal(nodes.length, 1, 'exactly one button per supported current toolbar');
    assert.equal(nodes[0].parentElement, bar);
    assert(p.buttons.has(nodes[0]), 'displayed node belongs to this plugin instance');
    return nodes[0];
  });
  assert.equal(p.buttons.size, buttons.length);
  return buttons;
}
function opens(h, button, p) {
  const before = h.app.opened.length;
  h.click(button);
  assert.equal(h.app.opened.length, before + 1, 'native dispatch reaches actual modal constructor/open boundary');
  const modal = h.app.opened.at(-1);
  assert(p.modals.has(modal)); assert.equal(modal.opened, true);
  return modal;
}
function inert(h, button) {
  const before = h.app.opened.length;
  h.click(button);
  for (const callback of h.callbacks(button)) callback();
  assert.equal(h.app.opened.length, before, 'dispatch and retained click callbacks cannot create a modal');
  assert.equal(h.listenerCount(button), 0, 'listener is explicitly released, not just guarded');
  assert.equal(button.parentElement, null, 'obsolete node removed from its parent');
}

test('complete detach/layout/reattach/unload/fresh-enable regression records DOM and functional ownership', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const original = pane.bar.querySelector(BUTTON);
  opens(h, original, p);
  pane.container.remove(); h.layout();
  const detached = { nodes: pane.bar.querySelectorAll(BUTTON).length, owned: p.buttons.size };
  h.document.body.append(pane.container); h.layout();
  const returned = pane.bar.querySelector(BUTTON);
  const reattached = { nodes: pane.bar.querySelectorAll(BUTTON).length, owned: p.buttons.size, fresh: returned !== original };
  h.disable(p);
  const afterUnload = pane.bar.querySelectorAll(BUTTON).length;
  const fresh = h.enable(), replacement = pane.bar.querySelector(BUTTON);
  const before = h.app.opened.length;
  h.click(replacement);
  // Aggregate only after the full sequence, so a failing baseline exposes the
  // stranded old node and dead click on fresh enable instead of stopping early.
  assert.deepEqual({ detached, reattached, afterUnload,
    fresh: { nodes: pane.bar.querySelectorAll(BUTTON).length, owned: fresh.buttons.size,
      replaced: replacement !== original && replacement !== returned, opened: h.app.opened.length - before } }, {
    detached: { nodes: 0, owned: 0 }, reattached: { nodes: 1, owned: 1, fresh: true }, afterUnload: 0,
    fresh: { nodes: 1, owned: 1, replaced: true, opened: 1 },
  });
  owned(fresh, [pane.bar]); inert(h, original); inert(h, returned);
});

for (const reconcile of [false, true]) test(`unload while detached, prior reconciliation=${reconcile}`, async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const [button] = owned(p, [pane.bar]); opens(h, button, p);
  pane.container.remove(); if (reconcile) h.layout();
  h.disable(p); h.document.body.append(pane.container); h.layout();
  assert.equal(pane.bar.querySelector(BUTTON), null); assert.equal(p.buttons.size, 0);
  inert(h, button);
  const fresh = h.enable(); opens(h, owned(fresh, [pane.bar])[0], fresh);
});

test('toolbar replaced inside a connected pane removes old node and click ownership', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const [old] = owned(p, [pane.bar]);
  // Keep the former toolbar connected, but outside the explorer container.
  h.document.body.append(pane.bar);
  const replacement = pane.container.createEl('div', { cls: 'nav-buttons-container' });
  h.layout(); inert(h, old); opens(h, owned(p, [replacement])[0], p);
});

test('connected pane removed from inventory is cleaned while independent pane survives', async t => {
  const h = await setup(t), a = h.pane(), b = h.pane(), p = h.enable();
  const [old, survivor] = owned(p, [a.bar, b.bar]);
  h.removeLeaf(a); h.layout();
  assert(a.container.isConnected); inert(h, old);
  assert.equal(owned(p, [b.bar])[0], survivor); opens(h, survivor, p);
});

test('detached listed panes and missing toolbars wait for a connected supported toolbar', async t => {
  const h = await setup(t), a = h.pane({ connected: false }), b = h.pane({ toolbar: false }), p = h.enable();
  assert.equal(a.bar.querySelector(BUTTON), null); assert.equal(p.buttons.size, 0);
  h.document.body.append(a.container);
  b.bar = b.container.createEl('div', { cls: 'nav-buttons-container' }); h.layout();
  for (const button of owned(p, [a.bar, b.bar])) opens(h, button, p);
});

test('repeated layout events and duplicate inventory preserve exact button identities', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const [button] = owned(p, [pane.bar]); h.duplicateLeaf(pane);
  for (let n = 0; n < 30; n++) {
    h.layout(); assert.equal(owned(p, [pane.bar])[0], button);
    assert.equal(h.listenerCount(button), 1); opens(h, button, p);
  }
});

test('removed button and retained callback are inert while plugin remains active', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const [button] = owned(p, [pane.bar]); button.remove(); h.layout();
  inert(h, button); const [replacement] = owned(p, [pane.bar]);
  assert.notEqual(replacement, button); opens(h, replacement, p);
});

for (const change of ['detach', 'inventory removal', 'toolbar replacement']) {
  test(`stale clicks are rejected before layout delivery after ${change}`, async t => {
    const h = await setup(t), pane = h.pane(), survivor = h.pane(), p = h.enable();
    const [old, survivingButton] = owned(p, [pane.bar, survivor.bar]);
    if (change === 'detach') pane.container.remove();
    else if (change === 'inventory removal') h.removeLeaf(pane);
    else {
      pane.bar.remove();
      pane.bar = pane.container.createEl('div', { cls: 'nav-buttons-container' });
    }
    const before = h.app.opened.length;
    h.click(old); h.callbacks(old).forEach(fn => fn());
    assert.equal(h.app.opened.length, before, 'stale click cannot race pending reconciliation');
    assert.equal(h.listenerCount(old), 1, 'listener remains owned until layout or unload');
    opens(h, survivingButton, p);
    h.layout(); inert(h, old);
    const bars = change === 'toolbar replacement' ? [pane.bar, survivor.bar] : [survivor.bar];
    assert.equal(owned(p, bars).at(-1), survivingButton);
    if (change === 'toolbar replacement') opens(h, owned(p, bars)[0], p);
  });
}

test('moved button outside supported toolbar is removed without disturbing other controls', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const [button] = owned(p, [pane.bar]);
  const other = pane.bar.createEl('button', { cls: 'another-plugin' });
  pane.container.append(button); h.layout();
  inert(h, button); assert.equal(other.parentElement, pane.bar);
  opens(h, owned(p, [pane.bar])[0], p);
});

test('repeated detach/reuse keeps nodes, listeners and cleanup registrations bounded', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const initialRegistrations = p.disposers.length;
  for (let n = 0; n < 60; n++) {
    const [button] = owned(p, [pane.bar]);
    pane.container.remove(); h.layout();
    assert.equal(p.buttons.size, 0); inert(h, button);
    assert.equal(p.disposers.length, initialRegistrations, 'no plugin-lifetime historical button registry');
    h.document.body.append(pane.container); h.layout(); opens(h, owned(p, [pane.bar])[0], p);
    h.app.opened.at(-1).close();
    assert.equal(p.modals.size, 0);
  }
});

test('unload closes owned modals and retained callbacks cannot alter a fresh instance', async t => {
  const h = await setup(t), pane = h.pane(), p = h.enable();
  const [old] = owned(p, [pane.bar]);
  const closed = opens(h, old, p); closed.close();
  assert.equal(closed.contentEl.childNodes.length, 0); assert.equal(p.modals.size, 0);
  const pending = opens(h, old, p);
  const lateLayouts = [...h.layoutReady, ...h.retainedEvents.filter(e => e.name === 'layout-change').map(e => e.fn)];
  h.disable(p); h.disable(p);
  assert.equal(closed.closeCount, 1); assert.equal(pending.closeCount, 1);
  assert.equal(pending.contentEl.childNodes.length, 0); assert.equal(p.modals.size, 0);
  assert.equal(h.activeEvents(), 0); inert(h, old);
  const fresh = h.enable(), [current] = owned(fresh, [pane.bar]);
  for (const fn of lateLayouts) { fn(); assert.equal(owned(fresh, [pane.bar])[0], current); }
  p.commands[0].callback(); inert(h, old); opens(h, current, fresh);
});

test('deferred layout-ready cannot create buttons after unload', async t => {
  const h = await setup(t, { ready: false }), pane = h.pane(), p = h.enable();
  assert.equal(pane.bar.querySelector(BUTTON), null);
  const late = [...h.layoutReady]; h.disable(p);
  late.forEach(fn => fn()); h.layout();
  assert.equal(pane.bar.querySelector(BUTTON), null); assert.equal(p.buttons.size, 0);
  const fresh = h.enable(); h.layoutReady.at(-1)(); opens(h, owned(fresh, [pane.bar])[0], fresh);
});

test('command and folder context menus retain selections and reject late opening after unload', async t => {
  const h = await setup(t), p = h.enable();
  const root = new TFolder('/'), a = new TFolder('A', root), b = new TFolder('B', root), file = new TFile('A/note.md', a);
  const items = [];
  const menu = { addItem(build) { const item = {
    setTitle(value) { this.title = value; return this; }, setIcon() { return this; },
    onClick(fn) { this.callback = fn; return this; },
  }; build(item); items.push(item); } };
  h.emit('file-menu', menu, root); h.emit('file-menu', menu, file); assert.equal(items.length, 0);
  h.emit('file-menu', menu, a); h.emit('files-menu', menu, [root, file, a, b]);
  assert.equal(items.length, 2);
  p.commands[0].callback(); assert.equal(h.app.opened.at(-1).picked.length, 0);
  items[0].callback(); assert.equal(h.app.opened.at(-1).picked[0], a);
  items[1].callback(); assert.deepEqual([...h.app.opened.at(-1).picked], [a, b]);
  h.disable(p); const before = h.app.opened.length;
  items.forEach(item => item.callback()); p.commands[0].callback();
  assert.equal(h.app.opened.length, before);
  assert(h.app.opened.every(modal => !modal.opened && modal.contentEl.childNodes.length === 0));
});

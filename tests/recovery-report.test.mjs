import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource, obsidian, TFolder, TFile } from './load-source.mjs';

const { MergeFailure, recoveryReport } = await loadSource('src/merge.ts', obsidian);

test('recovery report separates acknowledged operations, rejected operation and current file locations', () => {
  const report = recoveryReport(new MergeFailure('synthetic later move failure', 'Combined', [
    { kind: 'move', from: 'A/route.md', to: 'Outside/route 2.md' },
    { kind: 'move', from: 'A', to: 'Combined' },
    { kind: 'trash', from: 'B/empty' },
  ], { kind: 'move', from: 'B/Plan.md', to: 'Combined/Plan 3.md' }, [
    { from: 'A/route.md', to: 'Outside/route 2.md' },
    { from: 'A/Plan.md', to: 'Combined/Plan.md' },
    { from: 'B/Plan.md', to: 'B/Plan.md' },
    { from: 'B/missing.md', to: null },
  ]));
  const completed = report.split('Completed operations')[1].split('Failed operation:')[0];
  assert(completed.includes('move: A/route.md → Outside/route 2.md'));
  assert(completed.includes('move: A → Combined'));
  assert(completed.includes('trash: B/empty'));
  assert(!completed.includes('B/Plan.md'), 'the rejected move is not acknowledged');
  assert(report.includes('Failed operation: move: B/Plan.md → Combined/Plan 3.md'));
  assert(report.includes('MOVED: A/route.md → Outside/route 2.md'));
  assert(report.includes('MOVED: A/Plan.md → Combined/Plan.md'));
  assert(report.includes('UNCHANGED: B/Plan.md'));
  assert(report.includes('UNRESOLVED: B/missing.md'));
  assert.match(report, /not atomic.*not rolled back/);
  assert.match(report, /paths reported by Obsidian, not a disk or content verification/);
  assert.match(report, /rejected operation may have changed disk state/);
  assert.match(report, /Resolve any UNRESOLVED entries.*backup before retrying/);
  assert.match(report, /new plan from current paths/);
  assert.match(report, /recreate only routes still needed/);
  assert.match(report, /one source remains, also select the existing destination/);
  assert.match(report, /leave it in Notes mode/);
  assert.match(report, /Empty source folders may still need cleanup/);
  assert.match(report, /No automatic retry or rollback/);
  assert.match(report, /Check actual link destinations/);
});

test('a failure before any acknowledgement does not invent completed work or a failed operation', () => {
  const report = recoveryReport(new MergeFailure('host error', 'Combined', [], undefined, []));
  assert.match(report, /None acknowledged\./);
  assert.match(report, /Failed operation: unknown/);
  assert(!report.includes('MOVED:'));
  assert.match(report, /not saved across reloads/);
});

// Minimal host UI double: text is only accepted through text/value APIs. Any HTML
// insertion fails so path-like markup can never silently become interpreted HTML.
class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.attrs = {}; this.listeners = new Map();
    this.classes = new Set(); this.style = { setProperty() {} }; this.scrollTop = 0;
  }
  set innerHTML(_) { assert.fail('recovery UI must not interpret report text as HTML'); }
  insertAdjacentHTML() { assert.fail('recovery UI must not interpret report text as HTML'); }
  createEl(tag, options = {}) {
    const el = new Element(tag);
    el.text = options.text ?? ''; el.attrs = { ...options.attr };
    if (options.cls) options.cls.split(' ').forEach((cls) => el.classes.add(cls));
    this.children.push(el); return el;
  }
  createDiv(options) { return this.createEl('div', options); }
  createSpan(options) { return this.createEl('span', options); }
  addClass(cls) { this.classes.add(cls); }
  hasClass(cls) { return this.classes.has(cls); }
  toggleClass(cls, enabled) { enabled ? this.classes.add(cls) : this.classes.delete(cls); }
  setText(text) { this.text = text; }
  setAttr(name, value) { this.attrs[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  focus() { this.focused = true; }
  empty() { this.children.length = 0; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('.') ? child.classes.has(selector.slice(1)) : child.tag === selector) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  querySelectorAll(selector) {
    const tags = selector.split(',').map((tag) => tag.trim());
    return this.children.flatMap((child) => [ ...(tags.includes(child.tag) ? [child] : []), ...child.querySelectorAll(selector) ]);
  }
}
class Modal {
  constructor(app) {
    this.app = app; this.modalEl = new Element(); this.titleEl = this.modalEl.createEl('h2');
    this.contentEl = this.modalEl.createDiv(); this.opened = false;
  }
  open() { this.opened = true; this.app.openModals.push(this); this.onOpen?.(); }
  close() { this.opened = false; this.onClose?.(); }
}
const notices = [];
const { MergeModal, RecoveryModal } = await loadSource('src/modal.ts', {
  ...obsidian, Modal, FuzzySuggestModal: Modal,
  Notice: class { constructor(message, timeout) { notices.push({ message, timeout }); } },
}, { console: { error() {} } });

test('recovery modal keeps literal report text selectable and read-only until explicitly closed', () => {
  const app = { openModals: [] };
  const literalPath = 'A/<img src=x onerror=alert(1)> & [note].md';
  const report = `UNRESOLVED: ${literalPath}\nCopy this report before closing.`;
  const modal = new RecoveryModal(app, report);
  modal.open();
  const [textarea] = modal.contentEl.querySelectorAll('textarea');
  assert.equal(textarea.value, report);
  assert.equal(textarea.readOnly, true);
  assert.notEqual(textarea.disabled, true, 'a disabled field would prevent ordinary selection/copying');
  assert.match(textarea.attrs['aria-label'], /select and copy/);
  assert.equal(modal.opened, true, 'report remains visible after rendering');
  assert.equal(modal.contentEl.querySelectorAll('img').length, 0);
  const [close] = modal.contentEl.querySelectorAll('button');
  assert.equal(close.text, 'Close');
  close.listeners.get('click')();
  assert.equal(modal.opened, false);
  assert.equal(modal.contentEl.children.length, 0, 'close clears report UI');
});

function host(rejectLeadAfterMove = false) {
  const root = new TFolder('/'), a = new TFolder('A', root), b = new TFolder('B', root);
  const first = new TFile('A/first.md', a), pending = new TFile('B/pending.md', b);
  const entries = new Map([root, a, b, first, pending].map((item) => [item.path, item]));
  const app = {
    openModals: [], loadLocalStorage() {}, saveLocalStorage() {},
    vault: {
      getRoot: () => root, getName: () => 'Synthetic test vault',
      getAbstractFileByPath: (path) => entries.get(path) ?? null,
    },
    fileManager: {
      async renameFile(item, destination) {
        if (item === pending) throw new Error('synthetic later rename failure');
        assert.equal(item, a, 'first move should be the lead folder');
        for (const child of [a, first]) {
          const old = child.path; entries.delete(old);
          child.path = destination + old.slice(1); entries.set(child.path, child);
        }
        if (rejectLeadAfterMove) throw new Error('synthetic rejection after host mutation');
      },
      async trashFile() { assert.fail('failure must stop before source cleanup'); },
    },
  };
  return { app, a, b, entries };
}

function openMerge(v) {
  const modal = new MergeModal(v.app, [v.a, v.b]);
  modal.open();
  modal.nameInput.value = 'Combined';
  modal.nameInput.listeners.get('input')();
  return modal;
}

test('actual merge catch closes stale plan and opens persistent recovery after a successful move', async () => {
  notices.length = 0;
  const v = host(), modal = openMerge(v);
  await modal.merge();
  assert.equal(modal.opened, false);
  assert.equal(modal.contentEl.children.length, 0);
  assert.equal(notices.length, 0, 'partial failure must not be reduced to a transient notice');
  const recovery = v.app.openModals.find((entry) => entry instanceof RecoveryModal);
  assert(recovery?.opened);
  const report = recovery.contentEl.querySelectorAll('textarea')[0].value;
  assert(report.includes('move: A → Combined'));
  assert(report.includes('MOVED: A/first.md → Combined/first.md'));
  assert(report.includes('UNCHANGED: B/pending.md'));
  assert(report.includes('Failed operation: move: B/pending.md → Combined/pending.md'));
  assert(!v.entries.has('A'));
  assert(v.entries.has('B/pending.md'));
});

test('stale selection validation uses did-not-start Notice without inventing a partial merge report', async () => {
  notices.length = 0;
  const v = host(), modal = openMerge(v);
  v.entries.delete('B'); // Host changes after the plan is shown, before execution.
  await modal.merge();
  assert.equal(modal.opened, false);
  assert(!v.app.openModals.some((entry) => entry instanceof RecoveryModal));
  assert.equal(notices.length, 1);
  assert.match(notices[0].message, /Merge did not start:.*displayed plan is out of date/);
  assert.match(notices[0].message, /review the current paths/);
  assert(v.entries.has('A/first.md'), 'validation leaves the original files unmoved');
  assert(!v.entries.has('Combined'));
});


test('a host mutation followed by rejection remains failed while the report shows the current moved path', async () => {
  notices.length = 0;
  const v = host(true), modal = openMerge(v);
  await modal.merge();
  const recovery = v.app.openModals.find((entry) => entry instanceof RecoveryModal);
  assert(recovery?.opened);
  const report = recovery.contentEl.querySelectorAll('textarea')[0].value;
  assert.match(report, /None acknowledged\./);
  assert(report.includes('Failed operation: move: A → Combined'));
  assert(report.includes('MOVED: A/first.md → Combined/first.md'));
  assert(report.includes('UNCHANGED: B/pending.md'));
  assert.match(report, /rejected operation may have changed disk state/);
  assert.match(report, /not a disk or content verification/);
  assert(v.entries.has('Combined/first.md'));
  assert(!v.entries.has('A/first.md'));
  assert.equal(notices.length, 0);
});

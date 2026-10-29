import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const nativeRequire = createRequire(import.meta.url);

// Exercise the real TypeScript with a small host-API double; no Obsidian installation is modified.
export async function loadSource(entry, obsidian = {}, globals = {}) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['obsidian'] });
  const module = { exports: {} };
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    require: (id) => id === 'obsidian' ? obsidian : nativeRequire(id),
    console, process, TextEncoder, setTimeout, clearTimeout, ...globals,
  }, { filename: entry });
  return module.exports;
}

export class TFolder {
  constructor(path, parent = null) { this.path = path; this.parent = parent; this.children = []; parent?.children.push(this); }
  get name() { return this.path.split('/').pop(); }
  isRoot() { return this.path === '/'; }
}
export class TFile {
  constructor(path, parent) { this.path = path; this.parent = parent; parent.children.push(this); }
  get name() { return this.path.split('/').pop(); }
  get extension() { return this.name.includes('.') ? this.name.split('.').pop() : ''; }
  get basename() { return this.extension ? this.name.slice(0, -this.extension.length - 1) : this.name; }
}
export class Plugin {
  constructor(app) { this.app = app; this.disposers = []; }
  registerEvent(event) { this.disposers.push(event); }
  registerDomEvent() {}
}
export const normalizePath = (path) => path.normalize().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
export const obsidian = { TFolder, TFile, Plugin, normalizePath, getLinkpath: (path) => path.split('#')[0], setIcon() {} };

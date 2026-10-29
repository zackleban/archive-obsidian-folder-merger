import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json('manifest.json');
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const versions = await json('versions.json');
for (const key of ['id', 'name', 'version', 'minAppVersion', 'description', 'author']) {
  assert.equal(typeof manifest[key], 'string', `${key} must be a string`);
  assert(manifest[key].trim(), `${key} must not be empty`);
}
assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
assert(!manifest.id.includes('obsidian') && !manifest.id.endsWith('plugin'));
assert(!/obsidian|\bplugin\b/i.test(manifest.name));
assert.equal(typeof manifest.isDesktopOnly, 'boolean');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
assert(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(pkg.version, manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.equal(pkg.license, 'MIT');
assert.match(await readFile('LICENSE', 'utf8'), /MIT License/);
const readme = await readFile('README.md', 'utf8');
assert(readme.includes(`plugins/${manifest.id}/`), 'README must use the manifest ID as the install folder');
assert.match(readme, /npm run qa/);
for (const file of ['main.js', 'manifest.json', 'styles.css', 'README.md', 'LICENSE', 'versions.json']) assert((await stat(file)).size > 0, `${file} is empty`);
async function checkSource(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) { await checkSource(path); continue; }
    if (!path.endsWith('.ts')) continue;
    const source = await readFile(path, 'utf8');
    assert(!/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/.test(source), `${path}: avoid HTML string sinks`);
    assert(!/\b(?:eval|new Function)\s*\(/.test(source), `${path}: avoid dynamic code evaluation`);
    if (!manifest.isDesktopOnly) assert(!/from\s+["'](?:node:|fs["']|child_process["']|electron["'])/.test(source), `${path}: desktop API in mobile plugin`);
  }
}
await checkSource('src');
const bundle = await readFile('main.js', 'utf8');
assert(!bundle.includes('sourceMappingURL='), 'Build production assets before packaging');
assert(bundle.includes('module.exports'), 'Expected a CommonJS Obsidian entry point');
if (manifest.id === 'normal-terminal') {
  const notices = await readFile('THIRD_PARTY_LICENSES.txt', 'utf8');
  assert(bundle.includes(notices), 'Bundled third-party licenses must travel with main.js');
}
console.log(`${manifest.name}: metadata, source safety, documentation, licenses, and production assets passed.`);

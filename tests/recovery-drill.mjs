// Prepare/check synthetic files only: never runs a merge or claims a live pass.
// Agent decision 2026-10-28: keep fixture preparation separate from app execution
// so blocked runtime access cannot accidentally be reported as observed behavior.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureFiles, scenarios, finalMoves, filesAt, initialFiles, marker } from "./fixtures/partial-recovery.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(repo, "../obsidian-plugin-test-vaults");
const [command, argument, scenarioArgument] = process.argv.slice(2);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function inventory(vault, relative = "") {
  const files = {};
  for (const entry of await readdir(join(vault, relative), { withFileTypes: true })) {
    // App state, plugins and configured local trash aren't active fixture notes.
    if (entry.name.startsWith(".")) continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), `Refuse fixture symlink: ${path}`);
    if (entry.isDirectory()) Object.assign(files, await inventory(vault, path));
    else if (entry.isFile()) files[path] = await readFile(join(vault, path), "utf8");
  }
  return files;
}

if (command === "prepare") {
  assert.match(argument ?? "", /^[a-z0-9][a-z0-9-]*$/, "Supply a fresh lowercase run-name.");
  await mkdir(root, { recursive: true });
  const run = join(root, argument);
  await mkdir(run); // Fail if this drill already exists; never overwrite evidence.
  for (const scenario of scenarios) {
    const vault = join(run, scenario);
    const plugin = join(vault, ".obsidian/plugins/folder-merger");
    await mkdir(plugin, { recursive: true });
    for (const [path, text] of Object.entries(initialFiles(scenario))) {
      await mkdir(dirname(join(vault, path)), { recursive: true });
      await writeFile(join(vault, path), text, { flag: "wx" });
    }
    for (const file of ["main.js", "manifest.json", "styles.css"]) {
      await copyFile(join(repo, file), join(plugin, file), constants.COPYFILE_EXCL);
    }
    await writeFile(join(vault, ".obsidian/community-plugins.json"), "[]\n", { flag: "wx" });
    console.log(`Prepared ${vault}; plugin disabled. Enable Automatically update internal links in the app before merging.`);
  }
} else if (["verify-originals", "verify-final", "verify-links"].includes(command)) {
  assert(argument, "Supply a disposable vault path.");
  const vault = await realpath(resolve(argument));
  const allowed = await realpath(root);
  assert(vault.startsWith(allowed + sep), "Only disposable test vaults are allowed.");
  const scenario = scenarioArgument ?? vault.split(sep).at(-1);
  assert(scenarios.includes(scenario), "Specify notes, folder or recovery.");
  const actual = await inventory(vault);
  if (command === "verify-links") {
    const expected = filesAt(finalMoves(scenario));
    const byMarker = new Map(Object.entries(expected).map(([path, text]) => [marker(text), path]));
    const links = [...(actual["Inbound.md"] ?? "").matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/g)];
    assert.equal(links.length, byMarker.size, "Every inbound marker must retain its link.");
    const seen = new Set();
    for (const [, rawTarget, id] of links) {
      assert(!seen.has(id), `Duplicate inbound marker: ${id}`);
      seen.add(id);
      const target = rawTarget.replace(/\.md$/, "");
      const candidates = Object.keys(actual).filter(path => path.endsWith(".md") &&
        (path.slice(0, -3) === target || path.slice(0, -3).endsWith(`/${target}`)));
      assert.deepEqual(candidates, [byMarker.get(id)], `Link ${id} must unambiguously name its exact expected file.`);
      assert.equal(actual[candidates[0]], fixtureFiles[Object.keys(fixtureFiles).find(path => marker(fixtureFiles[path]) === id)]);
      console.log(`Link text names expected content: ${id} -> ${candidates[0]}`);
    }
    console.log("Static link-text check only. Open links in Obsidian to confirm its actual resolved destinations.");
  } else {
    const expected = command === "verify-originals" ? initialFiles(scenario) : filesAt(finalMoves(scenario));
    const contentFiles = { ...actual };
    if (command === "verify-final") {
      assert.equal(typeof contentFiles["Inbound.md"], "string", "Inbound.md must remain present.");
      delete contentFiles["Inbound.md"]; // Link rewrites are a separate check.
      for (const source of ["A", "B"]) {
        await assert.rejects(lstat(join(vault, source)), { code: "ENOENT" }, `Emptied source ${source} must no longer be active.`);
      }
    }
    assert.deepEqual(Object.keys(contentFiles).sort(), Object.keys(expected).sort(), "Fixture paths differ: extra or missing files.");
    for (const [path, text] of Object.entries(expected)) {
      assert.equal(contentFiles[path], text, `Exact content differs: ${path}`);
      console.log(`Exact bytes: ${path}; SHA-256 ${digest(text)}`);
    }
    console.log(`Verified ${Object.keys(expected).length} synthetic files (${command}); this is filesystem evidence, not a live-app pass.`);
  }
} else {
  throw Error("Usage: node tests/recovery-drill.mjs prepare <fresh-run-name> | verify-originals|verify-final|verify-links <disposable-vault> [notes|folder|recovery]");
}

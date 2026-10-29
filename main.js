"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FolderMergerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/modal.ts
var import_obsidian2 = require("obsidian");

// src/merge.ts
var import_obsidian = require("obsidian");
var join = (parent, name) => (0, import_obsidian.normalizePath)(parent.isRoot() ? name : `${parent.path}/${name}`);
var inside = (folder, outer) => outer.isRoot() ? !(folder instanceof import_obsidian.TFolder && folder.isRoot()) : folder.path.startsWith(`${outer.path}/`);
function countIn(folder) {
  const sum = { files: 0, folders: 0 };
  const walk = (dir) => {
    for (const child of dir.children) {
      if (child instanceof import_obsidian.TFolder) {
        sum.folders++;
        walk(child);
      } else sum.files++;
    }
  };
  walk(folder);
  return sum;
}
var MergeFailure = class extends Error {
  constructor(message, destination, completed, failed, files) {
    super(message);
    this.destination = destination;
    this.completed = completed;
    this.failed = failed;
    this.files = files;
    this.name = "MergeFailure";
  }
};
function recoveryReport(error) {
  const describe = (op) => `${op.kind}: ${op.from}${op.to ? ` \u2192 ${op.to}` : ""}`;
  return [
    `Merge stopped: ${error.message}`,
    `Destination: ${error.destination}`,
    "This merge is not atomic. Completed moves were not rolled back.",
    "Completed operations (a folder move includes its contents):",
    ...error.completed.length ? error.completed.map(describe) : ["None acknowledged."],
    `Failed operation: ${error.failed ? describe(error.failed) : "unknown"}`,
    "Source-file inventory at the stop (paths reported by Obsidian, not a disk or content verification):",
    ...error.files.map(({ from, to }) => to === null ? `UNRESOLVED: ${from}` : to === from ? `UNCHANGED: ${from}` : `MOVED: ${from} \u2192 ${to}`),
    "Pending work was stopped. Unchanged files may still need moving; files already in the destination may need no move. Empty source folders may still need cleanup.",
    "A rejected operation may have changed disk state before reporting an error. Inspect the source, destination and external routes, including the failed operation's paths. Resolve any UNRESOLVED entries and preserve a backup before retrying.",
    "Reopen Merge folders and build a new plan from current paths. Select only remaining source folders, keep their intended Folder/Notes modes, use the same destination, and recreate only routes still needed. Never reselect completed routed files or move completed destination contents again.",
    "If just one source remains, also select the existing destination; set the name/depth to that destination and leave it in Notes mode. If only empty-folder cleanup remains, inspect those folders and use Obsidian's trash command. No automatic retry or rollback is performed.",
    "Check actual link destinations after recovery with your internal-link update preference. Copy this report before closing; it is not saved across reloads."
  ].join("\n\n");
}
var MergeProgress = class {
  constructor(app) {
    this.app = app;
    this.completed = [];
  }
  async run(operation, action) {
    this.failed = operation;
    const value = await action();
    this.completed.push(operation);
    this.failed = void 0;
    return value;
  }
  move(item, to) {
    return this.run({ kind: "move", from: item.path, to }, () => this.app.fileManager.renameFile(item, to));
  }
};
var kindOf = (plan, folder) => plan.kinds.get(folder) ?? "notes";
var validFolderName = (name) => Boolean(name) && name === name.trim() && !/[\\/:*?"<>|#^[\]\x00-\x1f]/.test(name) && !name.startsWith(".") && !name.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
function validatePlan(app, picked, plan) {
  const live = (file) => app.vault.getAbstractFileByPath(file.path) === file;
  if (picked.length < 2 || new Set(picked).size !== picked.length) throw new Error("Choose at least two different folders.");
  if (picked.some((f) => f.isRoot() || !live(f))) throw new Error("A selected folder no longer exists. Reopen the merge window.");
  if (picked.some((f) => picked.some((other) => other !== f && inside(f, other)))) throw new Error("Selected folders cannot contain each other.");
  const parts = plan.path.split("/");
  if ((0, import_obsidian.normalizePath)(plan.path) !== plan.path || parts.some((part) => !part || part === "." || part === "..") || !validFolderName(parts[parts.length - 1])) {
    throw new Error("Choose a valid destination path.");
  }
  const parentPath = plan.path.includes("/") ? plan.path.slice(0, plan.path.lastIndexOf("/")) : "/";
  const parent = app.vault.getAbstractFileByPath(parentPath);
  if (!(parent instanceof import_obsidian.TFolder)) throw new Error("The destination parent no longer exists.");
  const existing = app.vault.getAbstractFileByPath(plan.path);
  if (existing && !(existing instanceof import_obsidian.TFolder)) throw new Error("A file already has the destination name.");
  if (picked.some((f) => plan.path.startsWith(`${f.path}/`) || existing instanceof import_obsidian.TFolder && inside(f, existing))) {
    throw new Error("The destination cannot be inside a selected folder or contain one.");
  }
  for (const [file, to] of plan.routes) {
    if (!live(file) || !picked.some((f) => inside(file, f))) throw new Error("A routed file has moved. Reopen the merge window.");
    if (to && (!live(to) || picked.some((f) => to === f || inside(to, f)))) throw new Error("A route destination is no longer available.");
  }
}
var merging = /* @__PURE__ */ new WeakSet();
async function mergeFolders(app, picked, plan) {
  if (merging.has(app)) throw new Error("Another folder merge is still running.");
  const sources = [...picked];
  const snapshot = { path: plan.path, kinds: new Map(plan.kinds), routes: new Map(plan.routes) };
  validatePlan(app, sources, snapshot);
  const originalFiles = /* @__PURE__ */ new Map();
  const remember = (folder) => {
    for (const child of folder.children) {
      if (child instanceof import_obsidian.TFolder) remember(child);
      else if (child instanceof import_obsidian.TFile) originalFiles.set(child, child.path);
    }
  };
  sources.forEach(remember);
  const progress = new MergeProgress(app);
  merging.add(app);
  try {
    return await executeMerge(app, sources, snapshot, progress);
  } catch (error) {
    throw new MergeFailure(
      error instanceof Error ? error.message : String(error),
      snapshot.path,
      progress.completed,
      progress.failed,
      [...originalFiles].map(([file, from]) => ({
        from,
        to: app.vault.getAbstractFileByPath(file.path) === file ? file.path : null
      }))
    );
  } finally {
    merging.delete(app);
  }
}
async function executeMerge(app, picked, plan, progress) {
  const result = { moved: 0, renamed: 0, target: picked[0] };
  for (const [file, to] of plan.routes) if (to) await place(app, file, to, result, progress);
  const existing = app.vault.getAbstractFileByPath(plan.path);
  let sources = [...picked];
  if (existing instanceof import_obsidian.TFolder) {
    result.target = existing;
    sources = sources.filter((s) => s !== existing);
  } else {
    const lead = sources.find((s) => kindOf(plan, s) === "notes");
    if (lead) {
      await progress.move(lead, plan.path);
      result.target = lead;
      sources = sources.filter((s) => s !== lead);
    } else result.target = await progress.run({ kind: "create", from: plan.path }, () => app.vault.createFolder(plan.path));
  }
  for (const [file, to] of plan.routes) if (!to) await place(app, file, result.target, result, progress);
  for (const source of sources) {
    if (kindOf(plan, source) === "notes") await mergeInto(app, source, result.target, result, progress);
    else await place(app, source, result.target, result, progress);
  }
  return result;
}
async function mergeInto(app, source, target, result, progress) {
  for (const child of [...source.children]) {
    const there = app.vault.getAbstractFileByPath(join(target, child.name));
    if (child instanceof import_obsidian.TFolder && there instanceof import_obsidian.TFolder) await mergeInto(app, child, there, result, progress);
    else await place(app, child, target, result, progress);
  }
  if (source.children.length === 0) await progress.run({ kind: "trash", from: source.path }, () => app.fileManager.trashFile(source));
}
async function place(app, item, to, result, progress) {
  if (item.parent === to) return;
  const taken = app.vault.getAbstractFileByPath(join(to, item.name));
  await progress.move(item, taken ? freeName(app, to, item) : join(to, item.name));
  if (taken) result.renamed++;
  result.moved++;
}
function freeName(app, target, file) {
  const base = file instanceof import_obsidian.TFile ? file.basename : file.name;
  const ext = file instanceof import_obsidian.TFile && file.extension ? `.${file.extension}` : "";
  for (let n = 2; ; n++) {
    const path = join(target, `${base} ${n}${ext}`);
    if (!app.vault.getAbstractFileByPath(path)) return path;
  }
}

// src/modal.ts
var FULL_KEY = "folder-merger-full";
var MergeModal = class extends import_obsidian2.Modal {
  constructor(app, start) {
    super(app);
    this.name = "";
    this.nameTouched = false;
    // Index into place(): 0 is the top of the vault.
    this.depth = 0;
    this.query = "";
    this.kinds = /* @__PURE__ */ new Map();
    // Notes sent somewhere by hand: a folder, or null for the top of the new folder.
    this.routes = /* @__PURE__ */ new Map();
    this.merging = false;
    this.picked = [...new Set(start)].filter((f) => !f.isRoot() && !start.some((o) => o !== f && inside(f, o)));
  }
  onOpen() {
    this.modalEl.addClass("folder-merger-modal");
    this.titleEl.setText("Merge folders");
    const { contentEl } = this;
    const expand = this.modalEl.createEl("button", { cls: "clickable-icon folder-merger-expand" });
    const setFull = (full) => {
      this.modalEl.toggleClass("is-full", full);
      (0, import_obsidian2.setIcon)(expand, full ? "minimize-2" : "maximize-2");
      expand.setAttr("aria-label", full ? "Back to normal size" : "Full screen");
      this.app.saveLocalStorage(FULL_KEY, full ? "1" : null);
    };
    expand.addEventListener("click", () => setFull(!this.modalEl.hasClass("is-full")));
    setFull(this.app.loadLocalStorage(FULL_KEY) === "1");
    const sides = contentEl.createDiv({ cls: "folder-merger-sides" });
    const left = sides.createDiv({ cls: "folder-merger-side" });
    const right = sides.createDiv({ cls: "folder-merger-side" });
    const search = left.createEl("input", {
      cls: "folder-merger-search",
      attr: { type: "search", placeholder: "Find a folder\u2026", "aria-label": "Find a folder" }
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.renderList();
    });
    this.listEl = left.createDiv({ cls: "folder-merger-list" });
    const panel = right.createDiv({ cls: "folder-merger-panel" });
    const nameRow = panel.createDiv({ cls: "folder-merger-field" });
    nameRow.createSpan({ cls: "folder-merger-label", text: "Name" });
    this.nameInput = nameRow.createEl("input", { attr: { type: "text", placeholder: "New folder name", "aria-label": "Destination folder name" } });
    this.nameInput.addEventListener("input", () => {
      this.name = this.nameInput.value;
      this.nameTouched = true;
      this.renderPlace();
    });
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !this.mergeEl.disabled) this.merge();
    });
    const depthRow = panel.createDiv({ cls: "folder-merger-field" });
    depthRow.createSpan({ cls: "folder-merger-label", text: "Depth" });
    const stepper = depthRow.createDiv({ cls: "folder-merger-stepper" });
    this.topEl = stepper.createEl("button");
    this.outEl = stepper.createEl("button");
    this.depthEl = stepper.createSpan({ cls: "folder-merger-depth" });
    this.inEl = stepper.createEl("button");
    (0, import_obsidian2.setIcon)(this.topEl, "arrow-left-to-line");
    (0, import_obsidian2.setIcon)(this.outEl, "arrow-left");
    (0, import_obsidian2.setIcon)(this.inEl, "arrow-right");
    this.topEl.addEventListener("click", () => this.step(-this.depth));
    this.outEl.addEventListener("click", () => this.step(-1));
    this.inEl.addEventListener("click", () => this.step(1));
    this.pathEl = panel.createDiv({ cls: "folder-merger-path" });
    this.noteEl = panel.createDiv({ cls: "folder-merger-note" });
    this.routesEl = right.createDiv({ cls: "folder-merger-routes" });
    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    this.mergeEl = buttons.createEl("button", { cls: "folder-merger-go" });
    this.mergeEl.addEventListener("click", () => this.merge());
    this.picked.length ? this.pickedChanged() : this.refresh();
    search.focus();
  }
  onClose() {
    this.contentEl.empty();
  }
  // The folders the arrows walk through: the top of the vault down to the first ticked folder's parent.
  place() {
    const chain = [];
    for (let f = this.picked[0]?.parent ?? this.app.vault.getRoot(); f; f = f.parent) chain.unshift(f);
    return chain;
  }
  toggle(folder) {
    const i = this.picked.indexOf(folder);
    if (i >= 0) this.picked.splice(i, 1);
    else this.picked.push(folder);
    this.pickedChanged();
  }
  pickedChanged() {
    for (const folder of this.kinds.keys()) if (!this.picked.includes(folder)) this.kinds.delete(folder);
    for (const [file, to] of this.routes) {
      const away = !this.picked.some((p) => inside(file, p));
      const into = to && this.picked.some((p) => to === p || inside(to, p));
      if (away || into) this.routes.delete(file);
    }
    if (!this.nameTouched) {
      this.name = this.picked[0]?.name ?? "";
      this.nameInput.value = this.name;
    }
    const chain = this.place();
    this.depth = 0;
    chain.forEach((f, i) => {
      if (this.picked.every((p) => inside(p, f))) this.depth = i;
    });
    this.refresh();
  }
  step(by) {
    this.depth = Math.max(0, Math.min(this.place().length - 1, this.depth + by));
    this.renderPlace();
  }
  refresh() {
    this.renderList();
    this.renderPlace();
  }
  renderList() {
    const scroll = this.listEl.scrollTop;
    this.listEl.empty();
    let shown = 0;
    const walk = (dir, level) => {
      const folders = dir.children.filter((c) => c instanceof import_obsidian2.TFolder).sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" }));
      for (const folder of folders) {
        if (!this.query || folder.path.toLowerCase().includes(this.query) || this.picked.includes(folder)) {
          this.renderRow(folder, this.query ? 0 : level);
          shown++;
        }
        walk(folder, level + 1);
      }
    };
    walk(this.app.vault.getRoot(), 0);
    if (!shown) this.listEl.createDiv({ cls: "folder-merger-empty", text: "No folders match." });
    this.listEl.scrollTop = scroll;
  }
  renderRow(folder, level) {
    const order = this.picked.indexOf(folder);
    const blocked = order < 0 && this.picked.some((p) => inside(folder, p) || inside(p, folder));
    const row = this.listEl.createEl("label", { cls: "folder-merger-row" });
    row.toggleClass("is-picked", order >= 0);
    row.toggleClass("is-blocked", blocked);
    row.style.setProperty("--folder-merger-level", String(level));
    if (blocked) row.setAttr("aria-label", "Already comes along with a ticked folder");
    const box = row.createEl("input", { attr: { type: "checkbox" } });
    box.checked = order >= 0;
    box.disabled = blocked;
    box.addEventListener("change", () => this.toggle(folder));
    (0, import_obsidian2.setIcon)(row.createSpan({ cls: "folder-merger-icon" }), "folder");
    const label = row.createSpan({ cls: "folder-merger-name", text: folder.name });
    if (this.query && folder.parent && !folder.parent.isRoot()) {
      label.createSpan({ cls: "folder-merger-parent", text: `  ${folder.parent.path}` });
    }
    row.createSpan({ cls: "folder-merger-count", text: String(countIn(folder).files) });
    if (order >= 0) {
      const kinds = row.createDiv({ cls: "folder-merger-kind" });
      for (const kind of ["folder", "notes"]) {
        const button = kinds.createEl("button", { text: kind === "folder" ? "Folder" : "Notes" });
        button.toggleClass("is-on", kindOf({ kinds: this.kinds }, folder) === kind);
        button.setAttr(
          "aria-label",
          kind === "folder" ? "Keep it as its own subfolder" : "Pour what it holds straight into the new folder"
        );
        button.addEventListener("click", (e) => {
          e.preventDefault();
          this.kinds.set(folder, kind);
          this.refresh();
        });
      }
      row.createSpan({ cls: "folder-merger-order", text: String(order + 1) });
    }
  }
  target() {
    const chain = this.place();
    return (0, import_obsidian2.normalizePath)(join(chain[Math.min(this.depth, chain.length - 1)], this.name.trim()));
  }
  // Why the merge can't run yet, or null when it can.
  problem() {
    const name = this.name.trim();
    if (this.picked.length < 2) return "Tick two or more folders.";
    if (!name) return "Give the new folder a name.";
    if (!validFolderName(name)) return "Use a folder name without reserved names, special characters, or a leading or trailing dot.";
    const there = this.app.vault.getAbstractFileByPath(this.target());
    if (there instanceof import_obsidian2.TFile) return "A file already has that name here.";
    if (there instanceof import_obsidian2.TFolder && this.picked.some((p) => inside(p, there))) {
      return "That folder holds one of the ticked folders. Pick another name or depth.";
    }
    return null;
  }
  renderPlace() {
    const chain = this.place();
    this.topEl.disabled = this.outEl.disabled = this.depth <= 0;
    this.inEl.disabled = this.depth >= chain.length - 1;
    this.topEl.setAttr("aria-label", this.depth > 0 ? `To the top of ${this.label(chain[0])}` : "Already at the top");
    this.outEl.setAttr("aria-label", this.depth > 0 ? `Out to ${this.label(chain[this.depth - 1])}` : "Already at the top");
    this.inEl.setAttr(
      "aria-label",
      this.depth < chain.length - 1 ? `Into ${chain[this.depth + 1].name}` : "As deep as the first folder goes"
    );
    this.depthEl.setText(this.depth === 0 ? "Top" : String(this.depth));
    this.pathEl.empty();
    chain.slice(0, this.depth + 1).forEach((f) => {
      this.pathEl.createSpan({ cls: "folder-merger-crumb", text: this.label(f) });
      this.pathEl.createSpan({ cls: "folder-merger-sep", text: "\u203A" });
    });
    this.pathEl.createSpan({ cls: "folder-merger-crumb is-new", text: this.name.trim() || "\u2026" });
    this.renderRoutes();
    const problem = this.problem();
    this.noteEl.toggleClass("is-problem", problem !== null);
    if (problem) this.noteEl.setText(problem);
    else {
      const files = this.picked.reduce((sum, f) => sum + countIn(f).files, 0);
      const there = this.app.vault.getAbstractFileByPath(this.target());
      const into = !(there instanceof import_obsidian2.TFolder) ? "into one new folder" : this.picked.includes(there) ? `into ${there.name}` : `into the ${there.name} folder already there`;
      const routed = this.routes.size ? ` ${this.routes.size} routed by hand.` : "";
      this.noteEl.setText(
        `${files} file${files === 1 ? "" : "s"} from ${this.picked.length} folders go ${into}.${routed} Same names keep both (the second gets a number). Link updates follow your Obsidian preference. Emptied folders go to the trash.`
      );
    }
    this.mergeEl.setText(this.picked.length >= 2 ? `Merge ${this.picked.length} folders` : "Merge");
    this.mergeEl.disabled = problem !== null;
  }
  // Every note in the ticked folders, with where it goes. Click the destination to send it somewhere else.
  renderRoutes() {
    const scroll = this.routesEl.querySelector(".folder-merger-route-list")?.scrollTop ?? 0;
    this.routesEl.empty();
    const notes = this.picked.flatMap((source) => filesIn(source).map((file) => ({ source, file })));
    if (!notes.length) return;
    this.routesEl.createDiv({
      cls: "folder-merger-routes-head",
      text: `Notes (${notes.length}) \xB7 click where one goes to send it somewhere else`
    });
    const list = this.routesEl.createDiv({ cls: "folder-merger-route-list" });
    for (const { source, file } of notes) {
      const row = list.createDiv({ cls: "folder-merger-route" });
      (0, import_obsidian2.setIcon)(row.createSpan({ cls: "folder-merger-icon" }), "file-text");
      const name = row.createSpan({ cls: "folder-merger-name", text: file.name });
      const from = file.parent && file.parent !== source ? file.parent.path.slice(source.path.length + 1) : "";
      name.createSpan({ cls: "folder-merger-parent", text: `  ${source.name}${from ? `/${from}` : ""}` });
      const routed = this.routes.has(file);
      const to = row.createEl("button", { cls: "folder-merger-dest", text: `\u2192 ${this.destination(source, file)}` });
      to.toggleClass("is-routed", routed);
      to.addEventListener(
        "click",
        () => new RouteSuggest(this.app, this.name.trim() || "the new folder", this.picked, (choice) => {
          if (choice === void 0) this.routes.delete(file);
          else this.routes.set(file, choice);
          this.renderPlace();
        }).open()
      );
      if (routed) {
        const reset = row.createEl("button", { cls: "folder-merger-reset clickable-icon", attr: { "aria-label": "Back to where the merge puts it" } });
        (0, import_obsidian2.setIcon)(reset, "x");
        reset.addEventListener("click", () => {
          this.routes.delete(file);
          this.renderPlace();
        });
      }
    }
    list.scrollTop = scroll;
  }
  // Where a note lands, as a path starting at the new folder (or the folder it was routed to).
  destination(source, file) {
    const name = this.name.trim() || "\u2026";
    const routed = this.routes.get(file);
    if (routed === null) return name;
    if (routed) return routed.isRoot() ? this.app.vault.getName() : routed.path;
    const inner = file.parent && file.parent !== source ? file.parent.path.slice(source.path.length + 1) : "";
    const keep = kindOf({ kinds: this.kinds }, source) === "folder" && this.app.vault.getAbstractFileByPath(this.target()) !== source;
    return [name, keep ? source.name : "", inner].filter(Boolean).join("/");
  }
  label(folder) {
    return folder.isRoot() ? this.app.vault.getName() : folder.name;
  }
  async merge() {
    if (this.merging || this.problem()) return;
    this.merging = true;
    const path = this.target();
    const picked = [...this.picked];
    const plan = { path, kinds: new Map(this.kinds), routes: new Map(this.routes) };
    this.modalEl.querySelectorAll("input, button").forEach((el) => el.disabled = true);
    this.mergeEl.setText("Merging\u2026");
    try {
      const result = await mergeFolders(this.app, picked, plan);
      const renamed = result.renamed ? `, ${result.renamed} renamed to keep both` : "";
      new import_obsidian2.Notice(`Merged into ${result.target.path}${renamed}.`);
      this.close();
    } catch (e) {
      console.error("Folder Merger", e);
      this.close();
      if (e instanceof MergeFailure) new RecoveryModal(this.app, recoveryReport(e)).open();
      else new import_obsidian2.Notice(`Merge did not start: ${e instanceof Error ? e.message : e}. Reopen the merge window and review the current paths.`, 12e3);
    }
  }
};
var RecoveryModal = class extends import_obsidian2.Modal {
  constructor(app, report) {
    super(app);
    this.report = report;
  }
  onOpen() {
    this.titleEl.setText("Merge stopped \u2014 review before retrying");
    const report = this.contentEl.createEl("textarea", { cls: "folder-merger-recovery-report" });
    report.value = this.report;
    report.readOnly = true;
    report.rows = 18;
    report.setAttr("aria-label", "Merge recovery report (select and copy before closing)");
    this.contentEl.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
};
function filesIn(folder) {
  return folder.children.flatMap((c) => c instanceof import_obsidian2.TFile ? [c] : c instanceof import_obsidian2.TFolder ? filesIn(c) : []);
}
var RouteSuggest = class extends import_obsidian2.FuzzySuggestModal {
  constructor(app, newName, picked, chosen) {
    super(app);
    this.newName = newName;
    this.picked = picked;
    this.chosen = chosen;
    this.setPlaceholder("Send this note to\u2026");
  }
  getItems() {
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => f instanceof import_obsidian2.TFolder).filter((f) => !this.picked.some((p) => f === p || inside(f, p))).sort((a, b) => a.path.localeCompare(b.path, void 0, { numeric: true, sensitivity: "base" }));
    return [
      { text: "Where the merge puts it", to: void 0 },
      { text: `Top of ${this.newName} (the new folder)`, to: null },
      ...folders.map((f) => ({ text: f.isRoot() ? `${this.app.vault.getName()} (top of the vault)` : f.path, to: f }))
    ];
  }
  getItemText(item) {
    return item.text;
  }
  onChooseItem(item) {
    this.chosen(item.to);
  }
};

// src/main.ts
var BUTTON_CLASS = "folder-merger-button";
var FolderMergerPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.buttons = /* @__PURE__ */ new Map();
    this.modals = /* @__PURE__ */ new Set();
    this.stopped = false;
  }
  onload() {
    this.addCommand({ id: "open", name: "Merge folders", callback: () => this.open([]) });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof import_obsidian3.TFolder) || file.isRoot()) return;
        menu.addItem(
          (item) => item.setTitle("Merge folders\u2026").setIcon("combine").onClick(() => this.open([file]))
        );
      })
    );
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files) => {
        const folders = files.filter((f) => f instanceof import_obsidian3.TFolder && !f.isRoot());
        if (folders.length === 0) return;
        menu.addItem(
          (item) => item.setTitle(`Merge ${folders.length} folders\u2026`).setIcon("combine").onClick(() => this.open(folders))
        );
      })
    );
    this.app.workspace.onLayoutReady(() => this.addButtons());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addButtons()));
  }
  onunload() {
    this.stopped = true;
    for (const button of this.buttons.keys()) this.removeButton(button);
    this.modals.forEach((modal) => modal.close());
    this.modals.clear();
  }
  open(start) {
    if (this.stopped) return;
    const modal = new MergeModal(this.app, start);
    const close = modal.onClose.bind(modal);
    modal.onClose = () => {
      close();
      this.modals.delete(modal);
    };
    this.modals.add(modal);
    modal.open();
  }
  currentToolbars() {
    const bars = /* @__PURE__ */ new Set();
    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      const container = leaf.view.containerEl;
      if (!container.isConnected) continue;
      const bar = container.querySelector(".nav-buttons-container");
      if (bar?.isConnected) bars.add(bar);
    }
    return bars;
  }
  removeButton(button) {
    const owner = this.buttons.get(button);
    if (!owner) return;
    button.removeEventListener("click", owner.onClick);
    button.remove();
    this.buttons.delete(button);
  }
  addButtons() {
    if (this.stopped) return;
    const bars = this.currentToolbars();
    const occupied = /* @__PURE__ */ new Set();
    for (const [button, owner] of this.buttons) {
      if (!bars.has(owner.bar) || button.parentElement !== owner.bar || occupied.has(owner.bar)) {
        this.removeButton(button);
      } else occupied.add(owner.bar);
    }
    for (const bar of bars) {
      if (occupied.has(bar)) continue;
      const button = bar.createEl("button", {
        cls: `clickable-icon nav-action-button ${BUTTON_CLASS}`,
        attr: { "aria-label": "Merge folders" }
      });
      const onClick = () => {
        if (this.stopped || this.buttons.get(button)?.onClick !== onClick || button.parentElement !== bar || !this.currentToolbars().has(bar)) return;
        this.open([]);
      };
      this.buttons.set(button, { bar, onClick });
      button.addEventListener("click", onClick);
      (0, import_obsidian3.setIcon)(button, "folder");
    }
  }
};

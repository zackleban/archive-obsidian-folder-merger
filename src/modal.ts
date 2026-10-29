import { App, FuzzySuggestModal, Modal, Notice, TFile, TFolder, normalizePath, setIcon } from "obsidian";
import { Kind, countIn, inside, join, kindOf, mergeFolders, validFolderName } from "./merge";

const FULL_KEY = "folder-merger-full";

// Tick folders, name the new one, step it in or out with the arrows, then merge.
export class MergeModal extends Modal {
	// In the order they were ticked; the arrows walk the path of the first one.
	private picked: TFolder[];
	private name = "";
	private nameTouched = false;
	// Index into place(): 0 is the top of the vault.
	private depth = 0;
	private query = "";
	private kinds = new Map<TFolder, Kind>();
	// Notes sent somewhere by hand: a folder, or null for the top of the new folder.
	private routes = new Map<TFile, TFolder | null>();
	private merging = false;

	private listEl!: HTMLElement;
	private nameInput!: HTMLInputElement;
	private topEl!: HTMLButtonElement;
	private outEl!: HTMLButtonElement;
	private inEl!: HTMLButtonElement;
	private depthEl!: HTMLElement;
	private pathEl!: HTMLElement;
	private noteEl!: HTMLElement;
	private routesEl!: HTMLElement;
	private mergeEl!: HTMLButtonElement;

	constructor(app: App, start: TFolder[]) {
		super(app);
		this.picked = [...new Set(start)].filter((f) => !f.isRoot() && !start.some((o) => o !== f && inside(f, o)));
	}

	onOpen() {
		this.modalEl.addClass("folder-merger-modal");
		this.titleEl.setText("Merge folders");
		const { contentEl } = this;

		// Full screen puts the folders on the left and the rest on the right; remembered for next time.
		const expand = this.modalEl.createEl("button", { cls: "clickable-icon folder-merger-expand" });
		const setFull = (full: boolean) => {
			this.modalEl.toggleClass("is-full", full);
			setIcon(expand, full ? "minimize-2" : "maximize-2");
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
			attr: { type: "search", placeholder: "Find a folder…", "aria-label": "Find a folder" },
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
		// ⇤ straight to the top of the vault, ← out one folder, → in one folder.
		const stepper = depthRow.createDiv({ cls: "folder-merger-stepper" });
		this.topEl = stepper.createEl("button");
		this.outEl = stepper.createEl("button");
		this.depthEl = stepper.createSpan({ cls: "folder-merger-depth" });
		this.inEl = stepper.createEl("button");
		setIcon(this.topEl, "arrow-left-to-line");
		setIcon(this.outEl, "arrow-left");
		setIcon(this.inEl, "arrow-right");
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
	private place(): TFolder[] {
		const chain: TFolder[] = [];
		for (let f: TFolder | null = this.picked[0]?.parent ?? this.app.vault.getRoot(); f; f = f.parent) chain.unshift(f);
		return chain;
	}

	private toggle(folder: TFolder) {
		const i = this.picked.indexOf(folder);
		if (i >= 0) this.picked.splice(i, 1);
		else this.picked.push(folder);
		this.pickedChanged();
	}

	private pickedChanged() {
		// Forget labels and routes that no longer fit: notes outside the ticked folders, or sent into one.
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
		// Start at the deepest folder that holds every ticked one.
		const chain = this.place();
		this.depth = 0;
		chain.forEach((f, i) => {
			if (this.picked.every((p) => inside(p, f))) this.depth = i;
		});
		this.refresh();
	}

	private step(by: number) {
		this.depth = Math.max(0, Math.min(this.place().length - 1, this.depth + by));
		this.renderPlace();
	}

	private refresh() {
		this.renderList();
		this.renderPlace();
	}

	private renderList() {
		const scroll = this.listEl.scrollTop;
		this.listEl.empty();
		let shown = 0;
		const walk = (dir: TFolder, level: number) => {
			const folders = dir.children
				.filter((c): c is TFolder => c instanceof TFolder)
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
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

	private renderRow(folder: TFolder, level: number) {
		const order = this.picked.indexOf(folder);
		// A folder inside a ticked one (or holding one) can't be ticked too; it already comes along.
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

		setIcon(row.createSpan({ cls: "folder-merger-icon" }), "folder");
		const label = row.createSpan({ cls: "folder-merger-name", text: folder.name });
		if (this.query && folder.parent && !folder.parent.isRoot()) {
			label.createSpan({ cls: "folder-merger-parent", text: `  ${folder.parent.path}` });
		}
		row.createSpan({ cls: "folder-merger-count", text: String(countIn(folder).files) });
		if (order >= 0) {
			// Folder keeps it as a subfolder of the new one; Notes pours what it holds straight in.
			const kinds = row.createDiv({ cls: "folder-merger-kind" });
			for (const kind of ["folder", "notes"] as Kind[]) {
				const button = kinds.createEl("button", { text: kind === "folder" ? "Folder" : "Notes" });
				button.toggleClass("is-on", kindOf({ kinds: this.kinds }, folder) === kind);
				button.setAttr(
					"aria-label",
					kind === "folder" ? "Keep it as its own subfolder" : "Pour what it holds straight into the new folder",
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

	private target(): string {
		const chain = this.place();
		return normalizePath(join(chain[Math.min(this.depth, chain.length - 1)], this.name.trim()));
	}

	// Why the merge can't run yet, or null when it can.
	private problem(): string | null {
		const name = this.name.trim();
		if (this.picked.length < 2) return "Tick two or more folders.";
		if (!name) return "Give the new folder a name.";
		if (!validFolderName(name)) return "Use a folder name without reserved names, special characters, or a leading or trailing dot.";
		const there = this.app.vault.getAbstractFileByPath(this.target());
		if (there instanceof TFile) return "A file already has that name here.";
		if (there instanceof TFolder && this.picked.some((p) => inside(p, there))) {
			return "That folder holds one of the ticked folders. Pick another name or depth.";
		}
		return null;
	}

	private renderPlace() {
		const chain = this.place();
		this.topEl.disabled = this.outEl.disabled = this.depth <= 0;
		this.inEl.disabled = this.depth >= chain.length - 1;
		this.topEl.setAttr("aria-label", this.depth > 0 ? `To the top of ${this.label(chain[0])}` : "Already at the top");
		this.outEl.setAttr("aria-label", this.depth > 0 ? `Out to ${this.label(chain[this.depth - 1])}` : "Already at the top");
		this.inEl.setAttr(
			"aria-label",
			this.depth < chain.length - 1 ? `Into ${chain[this.depth + 1].name}` : "As deep as the first folder goes",
		);
		this.depthEl.setText(this.depth === 0 ? "Top" : String(this.depth));

		this.pathEl.empty();
		chain.slice(0, this.depth + 1).forEach((f) => {
			this.pathEl.createSpan({ cls: "folder-merger-crumb", text: this.label(f) });
			this.pathEl.createSpan({ cls: "folder-merger-sep", text: "›" });
		});
		this.pathEl.createSpan({ cls: "folder-merger-crumb is-new", text: this.name.trim() || "…" });

		this.renderRoutes();
		const problem = this.problem();
		this.noteEl.toggleClass("is-problem", problem !== null);
		if (problem) this.noteEl.setText(problem);
		else {
			const files = this.picked.reduce((sum, f) => sum + countIn(f).files, 0);
			const there = this.app.vault.getAbstractFileByPath(this.target());
			const into = !(there instanceof TFolder)
				? "into one new folder"
				: this.picked.includes(there)
					? `into ${there.name}`
					: `into the ${there.name} folder already there`;
			const routed = this.routes.size ? ` ${this.routes.size} routed by hand.` : "";
			this.noteEl.setText(
				`${files} file${files === 1 ? "" : "s"} from ${this.picked.length} folders go ${into}.${routed} ` +
					"Same names keep both (the second gets a number). Links keep working. Emptied folders go to the trash.",
			);
		}
		this.mergeEl.setText(this.picked.length >= 2 ? `Merge ${this.picked.length} folders` : "Merge");
		this.mergeEl.disabled = problem !== null;
	}

	// Every note in the ticked folders, with where it goes. Click the destination to send it somewhere else.
	private renderRoutes() {
		const scroll = this.routesEl.querySelector(".folder-merger-route-list")?.scrollTop ?? 0;
		this.routesEl.empty();
		const notes = this.picked.flatMap((source) => filesIn(source).map((file) => ({ source, file })));
		if (!notes.length) return;
		this.routesEl.createDiv({
			cls: "folder-merger-routes-head",
			text: `Notes (${notes.length}) · click where one goes to send it somewhere else`,
		});
		const list = this.routesEl.createDiv({ cls: "folder-merger-route-list" });
		for (const { source, file } of notes) {
			const row = list.createDiv({ cls: "folder-merger-route" });
			setIcon(row.createSpan({ cls: "folder-merger-icon" }), "file-text");
			const name = row.createSpan({ cls: "folder-merger-name", text: file.name });
			const from = file.parent && file.parent !== source ? file.parent.path.slice(source.path.length + 1) : "";
			name.createSpan({ cls: "folder-merger-parent", text: `  ${source.name}${from ? `/${from}` : ""}` });

			const routed = this.routes.has(file);
			const to = row.createEl("button", { cls: "folder-merger-dest", text: `→ ${this.destination(source, file)}` });
			to.toggleClass("is-routed", routed);
			to.addEventListener("click", () =>
				new RouteSuggest(this.app, this.name.trim() || "the new folder", this.picked, (choice) => {
					if (choice === undefined) this.routes.delete(file);
					else this.routes.set(file, choice);
					this.renderPlace();
				}).open(),
			);
			if (routed) {
				const reset = row.createEl("button", { cls: "folder-merger-reset clickable-icon", attr: { "aria-label": "Back to where the merge puts it" } });
				setIcon(reset, "x");
				reset.addEventListener("click", () => {
					this.routes.delete(file);
					this.renderPlace();
				});
			}
		}
		list.scrollTop = scroll;
	}

	// Where a note lands, as a path starting at the new folder (or the folder it was routed to).
	private destination(source: TFolder, file: TFile): string {
		const name = this.name.trim() || "…";
		const routed = this.routes.get(file);
		if (routed === null) return name;
		if (routed) return routed.isRoot() ? this.app.vault.getName() : routed.path;
		const inner = file.parent && file.parent !== source ? file.parent.path.slice(source.path.length + 1) : "";
		const keep = kindOf({ kinds: this.kinds }, source) === "folder" && this.app.vault.getAbstractFileByPath(this.target()) !== source;
		return [name, keep ? source.name : "", inner].filter(Boolean).join("/");
	}

	private label(folder: TFolder) {
		return folder.isRoot() ? this.app.vault.getName() : folder.name;
	}

	private async merge() {
		if (this.merging || this.problem()) return;
		this.merging = true;
		const path = this.target();
		const picked = [...this.picked];
		const plan = { path, kinds: new Map(this.kinds), routes: new Map(this.routes) };
		this.modalEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach((el) => el.disabled = true);
		this.mergeEl.setText("Merging…");
		try {
			const result = await mergeFolders(this.app, picked, plan);
			const renamed = result.renamed ? `, ${result.renamed} renamed to keep both` : "";
			new Notice(`Merged into ${result.target.path}${renamed}.`);
			this.close();
		} catch (e) {
			console.error("Folder Merger", e);
			new Notice(`Merge stopped: ${e instanceof Error ? e.message : e}. Completed moves remain in ${path} or their chosen route destinations. Check those folders before retrying.`, 12000);
			this.close();
		}
	}
}

function filesIn(folder: TFolder): TFile[] {
	return folder.children.flatMap((c) => (c instanceof TFile ? [c] : c instanceof TFolder ? filesIn(c) : []));
}

// Picks where one note goes: back to the merge's choice (undefined), the top of the new folder (null), or any
// folder outside the ticked ones.
class RouteSuggest extends FuzzySuggestModal<{ text: string; to: TFolder | null | undefined }> {
	constructor(
		app: App,
		private newName: string,
		private picked: TFolder[],
		private chosen: (to: TFolder | null | undefined) => void,
	) {
		super(app);
		this.setPlaceholder("Send this note to…");
	}

	getItems() {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.filter((f) => !this.picked.some((p) => f === p || inside(f, p)))
			.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
		return [
			{ text: "Where the merge puts it", to: undefined },
			{ text: `Top of ${this.newName} (the new folder)`, to: null },
			...folders.map((f) => ({ text: f.isRoot() ? `${this.app.vault.getName()} (top of the vault)` : f.path, to: f })),
		];
	}

	getItemText(item: { text: string }) {
		return item.text;
	}

	onChooseItem(item: { to: TFolder | null | undefined }) {
		this.chosen(item.to);
	}
}

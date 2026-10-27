// Moving folders into one. Nothing is lost: everything is moved with Obsidian's own rename (so links
// keep working), same names get a number, and only folders left empty go to the trash.
import { App, TAbstractFile, TFile, TFolder } from "obsidian";

export const join = (parent: TFolder, name: string) => (parent.isRoot() ? name : `${parent.path}/${name}`);

// True when `folder` sits somewhere below `outer`.
export const inside = (folder: TAbstractFile, outer: TFolder) =>
	outer.isRoot() ? !(folder instanceof TFolder && folder.isRoot()) : folder.path.startsWith(`${outer.path}/`);

export function countIn(folder: TFolder): { files: number; folders: number } {
	const sum = { files: 0, folders: 0 };
	const walk = (dir: TFolder) => {
		for (const child of dir.children) {
			if (child instanceof TFolder) {
				sum.folders++;
				walk(child);
			} else sum.files++;
		}
	};
	walk(folder);
	return sum;
}

export interface MergeResult {
	moved: number;
	renamed: number;
	target: TFolder;
}

// "notes" pours what a ticked folder holds straight into the new folder; "folder" keeps it as a subfolder.
export type Kind = "notes" | "folder";

export interface MergePlan {
	path: string;
	kinds: Map<TFolder, Kind>;
	// Notes sent somewhere by hand: a folder, or null for the top of the new folder.
	routes: Map<TFile, TFolder | null>;
}

export const kindOf = (plan: Pick<MergePlan, "kinds">, folder: TFolder): Kind => plan.kinds.get(folder) ?? "notes";

// Puts every ticked folder into plan.path. When a folder is already there, everything goes into it; otherwise
// the first "notes" folder is moved and renamed to it, or a new folder is made when they are all "folder".
export async function mergeFolders(app: App, picked: TFolder[], plan: MergePlan): Promise<MergeResult> {
	const result: MergeResult = { moved: 0, renamed: 0, target: picked[0] };
	// Notes routed to folders that already exist leave first, so nothing else carries them along.
	for (const [file, to] of plan.routes) if (to) await place(app, file, to, result);

	const existing = app.vault.getAbstractFileByPath(plan.path);
	let sources = [...picked];
	if (existing instanceof TFolder) {
		result.target = existing;
		sources = sources.filter((s) => s !== existing);
	} else {
		const lead = sources.find((s) => kindOf(plan, s) === "notes");
		if (lead) {
			await app.fileManager.renameFile(lead, plan.path);
			result.target = lead;
			sources = sources.filter((s) => s !== lead);
		} else result.target = await app.vault.createFolder(plan.path);
	}

	for (const [file, to] of plan.routes) if (!to) await place(app, file, result.target, result);
	for (const source of sources) {
		if (kindOf(plan, source) === "notes") await mergeInto(app, source, result.target, result);
		else await place(app, source, result.target, result);
	}
	return result;
}

async function mergeInto(app: App, source: TFolder, target: TFolder, result: MergeResult) {
	for (const child of [...source.children]) {
		const there = app.vault.getAbstractFileByPath(join(target, child.name));
		if (child instanceof TFolder && there instanceof TFolder) await mergeInto(app, child, there, result);
		else await place(app, child, target, result);
	}
	if (source.children.length === 0) await app.fileManager.trashFile(source);
}

// Moves one note or folder into `to`, numbering it when the name is taken there.
async function place(app: App, item: TAbstractFile, to: TFolder, result: MergeResult) {
	if (item.parent === to) return;
	const taken = app.vault.getAbstractFileByPath(join(to, item.name));
	if (taken) result.renamed++;
	await app.fileManager.renameFile(item, taken ? freeName(app, to, item) : join(to, item.name));
	result.moved++;
}

// "Plan.md" becomes "Plan 2.md", "Notes" becomes "Notes 2", counting up until the name is free.
function freeName(app: App, target: TFolder, file: TAbstractFile): string {
	const base = file instanceof TFile ? file.basename : file.name;
	const ext = file instanceof TFile && file.extension ? `.${file.extension}` : "";
	for (let n = 2; ; n++) {
		const path = join(target, `${base} ${n}${ext}`);
		if (!app.vault.getAbstractFileByPath(path)) return path;
	}
}

// Moves use Obsidian's file manager so its link-update preference is respected.
// Same names get a number, and only folders left empty go to the trash.
import { App, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";

export const join = (parent: TFolder, name: string) => normalizePath(parent.isRoot() ? name : `${parent.path}/${name}`);

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

export type MergeOperation = { kind: "move" | "trash" | "create"; from: string; to?: string };
export interface FileLocation { from: string; to: string | null }

// A report of acknowledged operations and current host paths, never an undo log.
export class MergeFailure extends Error {
	constructor(
		message: string,
		readonly destination: string,
		readonly completed: MergeOperation[],
		readonly failed: MergeOperation | undefined,
		readonly files: FileLocation[],
	) {
		super(message);
		this.name = "MergeFailure";
	}
}

export function recoveryReport(error: MergeFailure): string {
	const describe = (op: MergeOperation) => `${op.kind}: ${op.from}${op.to ? ` → ${op.to}` : ""}`;
	return [
		`Merge stopped: ${error.message}`,
		`Destination: ${error.destination}`,
		"This merge is not atomic. Completed moves were not rolled back.",
		"Completed operations (a folder move includes its contents):",
		...(error.completed.length ? error.completed.map(describe) : ["None acknowledged."]),
		`Failed operation: ${error.failed ? describe(error.failed) : "unknown"}`,
		"Source-file inventory at the stop (paths reported by Obsidian, not a disk or content verification):",
		...error.files.map(({ from, to }) => to === null ? `UNRESOLVED: ${from}`
			: to === from ? `UNCHANGED: ${from}` : `MOVED: ${from} → ${to}`),
		"Pending work was stopped. Unchanged files may still need moving; files already in the destination may need no move. Empty source folders may still need cleanup.",
		"A rejected operation may have changed disk state before reporting an error. Inspect the source, destination and external routes, including the failed operation's paths. Resolve any UNRESOLVED entries and preserve a backup before retrying.",
		"Reopen Merge folders and build a new plan from current paths. Select only remaining source folders, keep their intended Folder/Notes modes, use the same destination, and recreate only routes still needed. Never reselect completed routed files or move completed destination contents again.",
		"If just one source remains, also select the existing destination; set the name/depth to that destination and leave it in Notes mode. If only empty-folder cleanup remains, inspect those folders and use Obsidian's trash command. No automatic retry or rollback is performed.",
		"Check actual link destinations after recovery with your internal-link update preference. Copy this report before closing; it is not saved across reloads.",
	].join("\n\n");
}

class MergeProgress {
	readonly completed: MergeOperation[] = [];
	failed: MergeOperation | undefined;
	constructor(readonly app: App) {}
	async run<T>(operation: MergeOperation, action: () => Promise<T>): Promise<T> {
		this.failed = operation;
		const value = await action();
		this.completed.push(operation);
		this.failed = undefined;
		return value;
	}
	move(item: TAbstractFile, to: string) {
		return this.run({ kind: "move", from: item.path, to }, () => this.app.fileManager.renameFile(item, to));
	}
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

export const validFolderName = (name: string): boolean => Boolean(name) && name === name.trim()
	&& !/[\\/:*?"<>|#^[\]\x00-\x1f]/.test(name) && !name.startsWith(".") && !name.endsWith(".")
	&& !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);

// Validate the whole plan before the first move, including stale objects from an open modal.
export function validatePlan(app: App, picked: TFolder[], plan: MergePlan): void {
	const live = (file: TAbstractFile) => app.vault.getAbstractFileByPath(file.path) === file;
	if (picked.length < 2 || new Set(picked).size !== picked.length) throw new Error("Choose at least two different folders.");
	if (picked.some((f) => f.isRoot() || !live(f))) throw new Error("A selected folder no longer exists. Reopen the merge window.");
	if (picked.some((f) => picked.some((other) => other !== f && inside(f, other)))) throw new Error("Selected folders cannot contain each other.");
	const parts = plan.path.split("/");
	if (normalizePath(plan.path) !== plan.path || parts.some((part) => !part || part === "." || part === "..") || !validFolderName(parts[parts.length - 1])) {
		throw new Error("Choose a valid destination path.");
	}
	const parentPath = plan.path.includes("/") ? plan.path.slice(0, plan.path.lastIndexOf("/")) : "/";
	const parent = app.vault.getAbstractFileByPath(parentPath);
	if (!(parent instanceof TFolder)) throw new Error("The destination parent no longer exists.");
	const existing = app.vault.getAbstractFileByPath(plan.path);
	if (existing && !(existing instanceof TFolder)) throw new Error("A file already has the destination name.");
	if (picked.some((f) => plan.path.startsWith(`${f.path}/`) || (existing instanceof TFolder && inside(f, existing)))) {
		throw new Error("The destination cannot be inside a selected folder or contain one.");
	}
	for (const [file, to] of plan.routes) {
		if (!live(file) || !picked.some((f) => inside(file, f))) throw new Error("A routed file has moved. Reopen the merge window.");
		if (to && (!live(to) || picked.some((f) => to === f || inside(to, f)))) throw new Error("A route destination is no longer available.");
	}
}

// Puts every ticked folder into plan.path. When a folder is already there, everything goes into it; otherwise
// the first "notes" folder is moved and renamed to it, or a new folder is made when they are all "folder".
const merging = new WeakSet<App>();

export async function mergeFolders(app: App, picked: TFolder[], plan: MergePlan): Promise<MergeResult> {
	if (merging.has(app)) throw new Error("Another folder merge is still running.");
	const sources = [...picked];
	const snapshot = { path: plan.path, kinds: new Map(plan.kinds), routes: new Map(plan.routes) };
	validatePlan(app, sources, snapshot);
	const originalFiles = new Map<TFile, string>();
	const remember = (folder: TFolder) => {
		for (const child of folder.children) {
			if (child instanceof TFolder) remember(child);
			else if (child instanceof TFile) originalFiles.set(child, child.path);
		}
	};
	sources.forEach(remember);
	const progress = new MergeProgress(app);
	merging.add(app);
	try {
		return await executeMerge(app, sources, snapshot, progress);
	} catch (error) {
		throw new MergeFailure(
			error instanceof Error ? error.message : String(error), snapshot.path,
			progress.completed, progress.failed,
			[...originalFiles].map(([file, from]) => ({
				from, to: app.vault.getAbstractFileByPath(file.path) === file ? file.path : null,
			})),
		);
	} finally {
		merging.delete(app);
	}
}

async function executeMerge(app: App, picked: TFolder[], plan: MergePlan, progress: MergeProgress): Promise<MergeResult> {
	const result: MergeResult = { moved: 0, renamed: 0, target: picked[0] };
	// Notes routed to folders that already exist leave first, so nothing else carries them along.
	for (const [file, to] of plan.routes) if (to) await place(app, file, to, result, progress);

	const existing = app.vault.getAbstractFileByPath(plan.path);
	let sources = [...picked];
	if (existing instanceof TFolder) {
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

async function mergeInto(app: App, source: TFolder, target: TFolder, result: MergeResult, progress: MergeProgress) {
	for (const child of [...source.children]) {
		const there = app.vault.getAbstractFileByPath(join(target, child.name));
		if (child instanceof TFolder && there instanceof TFolder) await mergeInto(app, child, there, result, progress);
		else await place(app, child, target, result, progress);
	}
	if (source.children.length === 0) await progress.run({ kind: "trash", from: source.path }, () => app.fileManager.trashFile(source));
}

// Moves one note or folder into `to`, numbering it when the name is taken there.
async function place(app: App, item: TAbstractFile, to: TFolder, result: MergeResult, progress: MergeProgress) {
	if (item.parent === to) return;
	const taken = app.vault.getAbstractFileByPath(join(to, item.name));
	await progress.move(item, taken ? freeName(app, to, item) : join(to, item.name));
	if (taken) result.renamed++;
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

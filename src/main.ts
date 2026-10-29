import { Plugin, TFolder, setIcon } from "obsidian";
import { MergeModal } from "./modal";

const BUTTON_CLASS = "folder-merger-button";

export default class FolderMergerPlugin extends Plugin {
	private buttons = new Set<HTMLElement>();
	private modals = new Set<MergeModal>();
	private stopped = false;
	onload() {
		this.addCommand({ id: "open", name: "Merge folders", callback: () => this.open([]) });

		// Right-click a folder, or several picked in the explorer, to start with them already ticked.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder) || file.isRoot()) return;
				menu.addItem((item) =>
					item.setTitle("Merge folders…").setIcon("combine").onClick(() => this.open([file])),
				);
			}),
		);
		this.registerEvent(
			this.app.workspace.on("files-menu", (menu, files) => {
				const folders = files.filter((f): f is TFolder => f instanceof TFolder && !f.isRoot());
				if (folders.length === 0) return;
				menu.addItem((item) =>
					item.setTitle(`Merge ${folders.length} folders…`).setIcon("combine").onClick(() => this.open(folders)),
				);
			}),
		);

		// The button sits at the right end of the file explorer's top bar, the row with New note and New folder.
		this.app.workspace.onLayoutReady(() => this.addButtons());
		this.registerEvent(this.app.workspace.on("layout-change", () => this.addButtons()));
	}

	onunload() {
		this.stopped = true;
		this.buttons.forEach((el) => el.remove());
		this.buttons.clear();
		this.modals.forEach((modal) => modal.close());
		this.modals.clear();
	}

	private open(start: TFolder[]) {
		if (this.stopped) return;
		const modal = new MergeModal(this.app, start);
		const close = modal.onClose.bind(modal);
		modal.onClose = () => { close(); this.modals.delete(modal); };
		this.modals.add(modal);
		modal.open();
	}

	private addButtons() {
		if (this.stopped) return;
		for (const button of this.buttons) if (!button.isConnected) this.buttons.delete(button);
		for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
			const bar = leaf.view.containerEl.querySelector(".nav-buttons-container");
			if (!bar || bar.querySelector(`.${BUTTON_CLASS}`)) continue;
			const button = bar.createEl("button", {
				cls: `clickable-icon nav-action-button ${BUTTON_CLASS}`,
				attr: { "aria-label": "Merge folders" },
			});
			setIcon(button, "folder");
			this.buttons.add(button);
			button.addEventListener("click", () => this.open([]));
		}
	}
}

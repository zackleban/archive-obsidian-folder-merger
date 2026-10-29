import { Plugin, TFolder, setIcon } from "obsidian";
import { MergeModal } from "./modal";

const BUTTON_CLASS = "folder-merger-button";

export default class FolderMergerPlugin extends Plugin {
	private buttons = new Map<HTMLElement, { bar: HTMLElement; onClick: () => void }>();
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
		for (const button of this.buttons.keys()) this.removeButton(button);
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

	private currentToolbars(): Set<HTMLElement> {
		const bars = new Set<HTMLElement>();
		for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
			const container = leaf.view.containerEl;
			if (!container.isConnected) continue;
			const bar = container.querySelector<HTMLElement>(".nav-buttons-container");
			if (bar?.isConnected) bars.add(bar);
		}
		return bars;
	}

	private removeButton(button: HTMLElement) {
		const owner = this.buttons.get(button);
		if (!owner) return;
		button.removeEventListener("click", owner.onClick);
		button.remove();
		this.buttons.delete(button);
	}

	private addButtons() {
		if (this.stopped) return;
		const bars = this.currentToolbars();
		const occupied = new Set<HTMLElement>();
		for (const [button, owner] of this.buttons) {
			if (!bars.has(owner.bar) || button.parentElement !== owner.bar || occupied.has(owner.bar)) {
				this.removeButton(button);
			} else occupied.add(owner.bar);
		}
		for (const bar of bars) {
			if (occupied.has(bar)) continue;
			const button = bar.createEl("button", {
				cls: `clickable-icon nav-action-button ${BUTTON_CLASS}`,
				attr: { "aria-label": "Merge folders" },
			});
			const onClick = () => {
				// A retained callback is inert after retirement, even while this plugin is active.
				if (this.stopped || this.buttons.get(button)?.onClick !== onClick
					|| button.parentElement !== bar || !this.currentToolbars().has(bar)) return;
				this.open([]);
			};
			this.buttons.set(button, { bar, onClick });
			button.addEventListener("click", onClick);
			setIcon(button, "folder");
		}
	}
}

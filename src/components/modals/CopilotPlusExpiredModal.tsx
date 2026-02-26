import { App, Modal } from "obsidian";

/**
 * Copilot Plus Expired Modal - Deprecated
 * All features are now available without license validation.
 * This modal is no longer shown.
 */
export class CopilotPlusExpiredModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Copilot" });
    contentEl.createEl("p", {
      text: "All Copilot features are available without license validation.",
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

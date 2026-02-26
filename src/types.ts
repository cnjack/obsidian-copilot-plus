import type { EditorView } from "@codemirror/view";
import { type TFile } from "obsidian";

declare module "obsidian" {
  interface MetadataCache {
    // Note that this API is considered internal and may work differently in the
    // future.
    getBacklinksForFile(file: TFile): {
      data: Map<string, any>;
    } | null;
  }

  interface Editor {
    /**
     * The underlying CodeMirror 6 editor view, when available.
     */
    cm?: EditorView;
  }

  interface MenuItem {
    /**
     * Creates a submenu for this item.
     */
    setSubmenu(): this;

    /**
     * Submenu instance created by `setSubmenu()`, when available.
     */
    submenu?: Menu;
  }
}

export enum PromptSortStrategy {
  TIMESTAMP = "timestamp",
  ALPHABETICAL = "alphabetical",
  MANUAL = "manual",
}

/**
 * Reasoning effort levels for OpenAI reasoning models
 */
export enum ReasoningEffort {
  MINIMAL = "minimal",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  XHIGH = "xhigh",
}

/**
 * Output verbosity levels for GPT-5 models
 */
export enum Verbosity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export type ApplyViewResult = "accepted" | "rejected" | "aborted" | "failed";

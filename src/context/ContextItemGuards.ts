/**
 * ContextItem Type Guards
 *
 * TypeScript type guards for narrowing ContextItem union types.
 */

import {
  ContextItem,
  ContextItemType,
  NoteRefContextItem,
  VaultSearchResultContextItem,
  UrlRefContextItem,
  YouTubeTranscriptContextItem,
  WebTabContextItem,
  SelectedTextNoteContextItem,
  SelectedTextWebContextItem,
  TagRefContextItem,
  FolderRefContextItem,
  CustomContentContextItem,
} from "./ContextItem";

/**
 * Check if a context item is of a specific type
 */
export function isContextItemType(item: ContextItem, type: ContextItemType): boolean {
  return item.type === type;
}

/**
 * Type guard for note reference context items
 */
export function isNoteRefContextItem(item: ContextItem): item is NoteRefContextItem {
  return item.type === "note_ref";
}

/**
 * Type guard for vault search result context items
 */
export function isVaultSearchResultContextItem(
  item: ContextItem
): item is VaultSearchResultContextItem {
  return item.type === "vault_search_result";
}

/**
 * Type guard for URL reference context items
 */
export function isUrlRefContextItem(item: ContextItem): item is UrlRefContextItem {
  return item.type === "url_ref";
}

/**
 * Type guard for YouTube transcript context items
 */
export function isYouTubeTranscriptContextItem(
  item: ContextItem
): item is YouTubeTranscriptContextItem {
  return item.type === "youtube_transcript";
}

/**
 * Type guard for web tab context items
 */
export function isWebTabContextItem(item: ContextItem): item is WebTabContextItem {
  return item.type === "web_tab";
}

/**
 * Type guard for selected text (note) context items
 */
export function isSelectedTextNoteContextItem(
  item: ContextItem
): item is SelectedTextNoteContextItem {
  return item.type === "selected_text_note";
}

/**
 * Type guard for selected text (web) context items
 */
export function isSelectedTextWebContextItem(item: ContextItem): item is SelectedTextWebContextItem {
  return item.type === "selected_text_web";
}

/**
 * Type guard for tag reference context items
 */
export function isTagRefContextItem(item: ContextItem): item is TagRefContextItem {
  return item.type === "tag_ref";
}

/**
 * Type guard for folder reference context items
 */
export function isFolderRefContextItem(item: ContextItem): item is FolderRefContextItem {
  return item.type === "folder_ref";
}

/**
 * Type guard for custom content context items
 */
export function isCustomContentContextItem(item: ContextItem): item is CustomContentContextItem {
  return item.type === "custom_content";
}

/**
 * Check if context item has content loaded
 */
export function hasContextContent(item: ContextItem): item is ContextItem & { content: string } {
  return "content" in item && typeof item.content === "string" && item.content.length > 0;
}

/**
 * Check if context item is from vault source
 */
export function isVaultSource(item: ContextItem): boolean {
  return item.source === "vault";
}

/**
 * Check if context item is from web source
 */
export function isWebSource(item: ContextItem): boolean {
  return item.source === "web";
}

/**
 * Check if context item requires content loading
 */
export function requiresContentLoaded(item: ContextItem): boolean {
  // These types always have content
  if (
    item.type === "vault_search_result" ||
    item.type === "youtube_transcript" ||
    item.type === "selected_text_note" ||
    item.type === "selected_text_web" ||
    item.type === "custom_content"
  ) {
    return false;
  }
  // Other types may need content loaded on demand
  return !hasContextContent(item);
}

/**
 * Get content from context item (may be empty)
 */
export function getContextContent(item: ContextItem): string {
  if ("content" in item && typeof item.content === "string") {
    return item.content;
  }
  return "";
}

/**
 * Get path/URL identifier from context item
 */
export function getContextIdentifier(item: ContextItem): string {
  switch (item.type) {
    case "note_ref":
      return (item as NoteRefContextItem).path;
    case "vault_search_result":
      return (item as VaultSearchResultContextItem).path;
    case "selected_text_note":
      return (item as SelectedTextNoteContextItem).notePath;
    case "url_ref":
      return (item as UrlRefContextItem).url;
    case "youtube_transcript":
      return (item as YouTubeTranscriptContextItem).url;
    case "selected_text_web":
      return (item as SelectedTextWebContextItem).url;
    case "web_tab":
      return (item as WebTabContextItem).url;
    case "tag_ref":
      return (item as TagRefContextItem).tag;
    case "folder_ref":
      return (item as FolderRefContextItem).path;
    case "custom_content":
    default:
      return item.id;
  }
}

/**
 * Validate that a context item has required fields for its type
 */
export function validateContextItem(item: ContextItem): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required base fields
  if (!item.id) errors.push("Missing required field: id");
  if (!item.type) errors.push("Missing required field: type");
  if (!item.title) errors.push("Missing required field: title");
  if (!item.source) errors.push("Missing required field: source");

  // Type-specific validation
  switch (item.type) {
    case "note_ref": {
      const typed = item as NoteRefContextItem;
      if (!typed.path) errors.push("note_ref missing required field: path");
      break;
    }
    case "vault_search_result": {
      const typed = item as VaultSearchResultContextItem;
      if (!typed.path) errors.push("vault_search_result missing required field: path");
      if (!typed.content) errors.push("vault_search_result missing required field: content");
      if (typeof typed.score !== "number")
        errors.push("vault_search_result missing required field: score");
      break;
    }
    case "url_ref": {
      const typed = item as UrlRefContextItem;
      if (!typed.url) errors.push("url_ref missing required field: url");
      break;
    }
    case "youtube_transcript": {
      const typed = item as YouTubeTranscriptContextItem;
      if (!typed.url) errors.push("youtube_transcript missing required field: url");
      if (!typed.videoId) errors.push("youtube_transcript missing required field: videoId");
      if (!typed.content) errors.push("youtube_transcript missing required field: content");
      break;
    }
    case "web_tab": {
      const typed = item as WebTabContextItem;
      if (!typed.url) errors.push("web_tab missing required field: url");
      break;
    }
    case "selected_text_note": {
      const typed = item as SelectedTextNoteContextItem;
      if (!typed.content) errors.push("selected_text_note missing required field: content");
      if (!typed.notePath) errors.push("selected_text_note missing required field: notePath");
      if (!typed.noteTitle) errors.push("selected_text_note missing required field: noteTitle");
      break;
    }
    case "selected_text_web": {
      const typed = item as SelectedTextWebContextItem;
      if (!typed.content) errors.push("selected_text_web missing required field: content");
      if (!typed.url) errors.push("selected_text_web missing required field: url");
      if (!typed.pageTitle) errors.push("selected_text_web missing required field: pageTitle");
      break;
    }
    case "tag_ref": {
      const typed = item as TagRefContextItem;
      if (!typed.tag) errors.push("tag_ref missing required field: tag");
      break;
    }
    case "folder_ref": {
      const typed = item as FolderRefContextItem;
      if (!typed.path) errors.push("folder_ref missing required field: path");
      break;
    }
    case "custom_content": {
      const typed = item as CustomContentContextItem;
      if (!typed.content) errors.push("custom_content missing required field: content");
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

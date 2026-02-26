/**
 * ContextItem Serialization Utilities
 *
 * Functions to serialize ContextItems into LLM context format (XML tags).
 */

import {
  ContextItem,
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
import {
  isNoteRefContextItem,
  isVaultSearchResultContextItem,
  isUrlRefContextItem,
  isYouTubeTranscriptContextItem,
  isWebTabContextItem,
  isSelectedTextNoteContextItem,
  isSelectedTextWebContextItem,
  isTagRefContextItem,
  isFolderRefContextItem,
  isCustomContentContextItem,
  getContextContent,
} from "./ContextItemGuards";

/**
 * XML tag mapping for each context item type
 */
const CONTEXT_XML_TAGS: Record<ContextItem["type"], string> = {
  note_ref: "note",
  vault_search_result: "search_result",
  url_ref: "url",
  youtube_transcript: "youtube_transcript",
  web_tab: "web_tab",
  selected_text_note: "selected_text",
  selected_text_web: "selected_text",
  tag_ref: "tag",
  folder_ref: "folder",
  custom_content: "custom",
};

/**
 * Escape XML special characters in content
 */
export function escapeXml(content: string): string {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serialize a single context item to XML format
 */
export function serializeContextItemToXml(item: ContextItem): string {
  const tagName = CONTEXT_XML_TAGS[item.type];

  switch (item.type) {
    case "note_ref":
      return serializeNoteRefToXml(item, tagName);
    case "vault_search_result":
      return serializeVaultSearchResultToXml(item, tagName);
    case "url_ref":
      return serializeUrlRefToXml(item, tagName);
    case "youtube_transcript":
      return serializeYouTubeTranscriptToXml(item, tagName);
    case "web_tab":
      return serializeWebTabToXml(item, tagName);
    case "selected_text_note":
    case "selected_text_web":
      return serializeSelectedTextToXml(item, tagName);
    case "tag_ref":
      return serializeTagRefToXml(item, tagName);
    case "folder_ref":
      return serializeFolderRefToXml(item, tagName);
    case "custom_content":
      return serializeCustomContentToXml(item, tagName);
    default:
      return serializeUnknownContextItem(item);
  }
}

/**
 * Serialize note reference to XML
 */
function serializeNoteRefToXml(item: NoteRefContextItem, tagName: string): string {
  const content = getContextContent(item);
  const attrs = [`title="${escapeXml(item.title)}"`, `path="${escapeXml(item.path)}"`];

  if (item.section) attrs.push(`section="${escapeXml(item.section)}"`);
  if (item.lineStart !== undefined) attrs.push(`lineStart="${item.lineStart}"`);
  if (item.lineEnd !== undefined) attrs.push(`lineEnd="${item.lineEnd}"`);
  if (item.score !== undefined) attrs.push(`score="${item.score}"`);

  const attrString = attrs.join(" ");

  if (content) {
    return `<${tagName} ${attrString}>\n${escapeXml(content)}\n</${tagName}>`;
  }

  return `<${tagName} ${attrString} />`;
}

/**
 * Serialize vault search result to XML
 */
function serializeVaultSearchResultToXml(
  item: VaultSearchResultContextItem,
  tagName: string
): string {
  const attrs = [
    `title="${escapeXml(item.title)}"`,
    `path="${escapeXml(item.path)}"`,
    `score="${item.score}"`,
  ];

  if (item.section) attrs.push(`section="${escapeXml(item.section)}"`);
  if (item.explanation) attrs.push(`explanation="${escapeXml(item.explanation)}"`);

  const attrString = attrs.join(" ");
  const content = item.content || "";

  return `<${tagName} ${attrString}>\n${escapeXml(content)}\n</${tagName}>`;
}

/**
 * Serialize URL reference to XML
 */
function serializeUrlRefToXml(item: UrlRefContextItem, tagName: string): string {
  const attrs = [`title="${escapeXml(item.title)}"`, `url="${escapeXml(item.url)}"`];

  if (item.faviconUrl) attrs.push(`favicon="${escapeXml(item.faviconUrl)}"`);
  if (item.metadata?.domain) attrs.push(`domain="${escapeXml(item.metadata.domain)}"`);

  const attrString = attrs.join(" ");
  const content = getContextContent(item);

  if (content) {
    return `<${tagName} ${attrString}>\n${escapeXml(content)}\n</${tagName}>`;
  }

  return `<${tagName} ${attrString} />`;
}

/**
 * Serialize YouTube transcript to XML
 */
function serializeYouTubeTranscriptToXml(item: YouTubeTranscriptContextItem, tagName: string): string {
  const attrs = [
    `title="${escapeXml(item.title)}"`,
    `url="${escapeXml(item.url)}"`,
    `videoId="${item.videoId}"`,
  ];

  if (item.duration) attrs.push(`duration="${item.duration}"`);
  if (item.author) attrs.push(`author="${escapeXml(item.author)}"`);

  const attrString = attrs.join(" ");

  return `<${tagName} ${attrString}>\n${escapeXml(item.content)}\n</${tagName}>`;
}

/**
 * Serialize web tab to XML
 */
function serializeWebTabToXml(item: WebTabContextItem, tagName: string): string {
  const attrs = [`title="${escapeXml(item.title)}"`, `url="${escapeXml(item.url)}"`];

  if (item.faviconUrl) attrs.push(`favicon="${escapeXml(item.faviconUrl)}"`);
  if (item.isLoaded !== undefined) attrs.push(`loaded="${item.isLoaded}"`);
  if (item.isActive) attrs.push(`active="true"`);

  const attrString = attrs.join(" ");
  const content = getContextContent(item);

  if (content) {
    return `<${tagName} ${attrString}>\n${escapeXml(content)}\n</${tagName}>`;
  }

  return `<${tagName} ${attrString} />`;
}

/**
 * Serialize selected text to XML
 */
function serializeSelectedTextToXml(
  item: SelectedTextNoteContextItem | SelectedTextWebContextItem,
  tagName: string
): string {
  const attrs: string[] = [];

  if (item.type === "selected_text_note") {
    attrs.push(`sourceType="note"`);
    attrs.push(`noteTitle="${escapeXml(item.noteTitle)}"`);
    attrs.push(`notePath="${escapeXml(item.notePath)}"`);
    attrs.push(`startLine="${item.startLine}"`);
    attrs.push(`endLine="${item.endLine}"`);
  } else {
    attrs.push(`sourceType="web"`);
    attrs.push(`pageTitle="${escapeXml(item.pageTitle)}"`);
    attrs.push(`url="${escapeXml(item.url)}"`);
    if (item.faviconUrl) attrs.push(`favicon="${escapeXml(item.faviconUrl)}"`);
  }

  const attrString = attrs.join(" ");

  return `<${tagName} ${attrString}>\n${escapeXml(item.content)}\n</${tagName}>`;
}

/**
 * Serialize tag reference to XML
 */
function serializeTagRefToXml(item: TagRefContextItem, tagName: string): string {
  const attrs = [`tag="${escapeXml(item.tag)}"`, `title="${escapeXml(item.title)}"`];

  if (item.matchingNotes && item.matchingNotes.length > 0) {
    const notesAttr = item.matchingNotes.map((n) => escapeXml(n)).join(",");
    attrs.push(`notes="${notesAttr}"`);
  }

  const attrString = attrs.join(" ");
  return `<${tagName} ${attrString} />`;
}

/**
 * Serialize folder reference to XML
 */
function serializeFolderRefToXml(item: FolderRefContextItem, tagName: string): string {
  const attrs = [`path="${escapeXml(item.path)}"`, `title="${escapeXml(item.title)}"`];

  if (item.matchingNotes && item.matchingNotes.length > 0) {
    const notesAttr = item.matchingNotes.map((n) => escapeXml(n)).join(",");
    attrs.push(`notes="${notesAttr}"`);
  }

  const attrString = attrs.join(" ");
  return `<${tagName} ${attrString} />`;
}

/**
 * Serialize custom content to XML
 */
function serializeCustomContentToXml(item: CustomContentContextItem, tagName: string): string {
  const attrs = [`title="${escapeXml(item.title)}"`, `source="${item.source}"`];

  const attrString = attrs.join(" ");

  return `<${tagName} ${attrString}>\n${escapeXml(item.content)}\n</${tagName}>`;
}

/**
 * Serialize unknown context item (fallback)
 */
function serializeUnknownContextItem(item: ContextItem): string {
  const attrs = [
    `id="${item.id}"`,
    `type="${item.type}"`,
    `title="${escapeXml(item.title)}"`,
  ];

  const attrString = attrs.join(" ");
  return `<unknown_context ${attrString} />`;
}

/**
 * Serialize multiple context items to XML
 */
export function serializeContextItemsToXml(items: ContextItem[]): string {
  if (items.length === 0) {
    return "";
  }

  return items.map((item) => serializeContextItemToXml(item)).join("\n\n");
}

/**
 * Serialize context items grouped by type
 */
export function serializeContextItemsGrouped(items: ContextItem[]): Record<string, string> {
  const grouped: Record<string, ContextItem[]> = {};

  for (const item of items) {
    const typeGroup = item.type;
    if (!grouped[typeGroup]) {
      grouped[typeGroup] = [];
    }
    grouped[typeGroup].push(item);
  }

  const result: Record<string, string> = {};

  for (const [type, typeItems] of Object.entries(grouped)) {
    result[type] = serializeContextItemsToXml(typeItems);
  }

  return result;
}

/**
 * Get a summary of context items for display
 */
export function getContextSummary(items: ContextItem[]): {
  total: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }

  return {
    total: items.length,
    byType,
    bySource,
  };
}

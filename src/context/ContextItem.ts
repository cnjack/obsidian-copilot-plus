/**
 * Unified Context Item Data Structure
 *
 * This module defines a unified data model for context items that can represent:
 * - Note references (from Obsidian vault)
 * - Vault search results
 * - URL references (web links)
 * - YouTube transcripts
 * - Web tab content
 * - Selected text (from notes or web)
 * - Tag references
 * - Folder references
 *
 * All context items share a common interface for uniform handling in the
 * AgentChainRunner and prompt construction pipeline.
 */

/**
 * Source type - where the context item originates
 */
export type ContextSourceType = "vault" | "web" | "user" | "system";

/**
 * Context item type - specific kind of context
 */
export type ContextItemType =
  | "note_ref"
  | "vault_search_result"
  | "url_ref"
  | "youtube_transcript"
  | "web_tab"
  | "selected_text_note"
  | "selected_text_web"
  | "tag_ref"
  | "folder_ref"
  | "custom_content";

/**
 * Base interface for all context items
 */
export interface BaseContextItem {
  /** Unique identifier for this context item */
  id: string;

  /** Type of context item */
  type: ContextItemType;

  /** Human-readable title */
  title: string;

  /** Where this context comes from */
  source: ContextSourceType;

  /** Whether this item is currently active/selected */
  isActive?: boolean;

  /** Optional score/relevance (for search results) */
  score?: number;

  /** Optional explanation (for search results) */
  explanation?: string;
}

/**
 * Note reference context item
 */
export interface NoteRefContextItem extends BaseContextItem {
  type: "note_ref";
  /** Path to the note in vault */
  path: string;
  /** Optional specific section/block reference */
  section?: string;
  /** Optional line range */
  lineStart?: number;
  lineEnd?: number;
  /** Cached content (optional, may be loaded on demand) */
  content?: string;
  /** Obsidian-specific metadata */
  metadata?: {
    ctime?: number;
    mtime?: number;
    size?: number;
    tags?: string[];
  };
}

/**
 * Vault search result context item
 */
export interface VaultSearchResultContextItem extends BaseContextItem {
  type: "vault_search_result";
  /** Path to the matching note */
  path: string;
  /** The matching content chunk */
  content: string;
  /** Score from the search */
  score: number;
  /** Optional explanation of why this matched */
  explanation?: string;
  /** Optional section within the note */
  section?: string;
}

/**
 * URL reference context item
 */
export interface UrlRefContextItem extends BaseContextItem {
  type: "url_ref";
  /** The URL */
  url: string;
  /** Optional favicon URL */
  faviconUrl?: string;
  /** Optional fetched content */
  content?: string;
  /** Optional metadata about the page */
  metadata?: {
    domain?: string;
    fetchedAt?: number;
  };
}

/**
 * YouTube transcript context item
 */
export interface YouTubeTranscriptContextItem extends BaseContextItem {
  type: "youtube_transcript";
  /** YouTube video URL */
  url: string;
  /** Video ID extracted from URL */
  videoId: string;
  /** Transcript content */
  content: string;
  /** Video duration in seconds */
  duration?: number;
  /** Video author/channel */
  author?: string;
  /** When transcript was fetched */
  fetchedAt?: number;
}

/**
 * Web tab context item (from Web Viewer)
 */
export interface WebTabContextItem extends BaseContextItem {
  type: "web_tab";
  /** Tab URL */
  url: string;
  /** Tab title */
  title: string;
  /** Optional favicon */
  faviconUrl?: string;
  /** Whether tab content is loaded */
  isLoaded?: boolean;
  /** Optional fetched content */
  content?: string;
}

/**
 * Selected text from a note context item
 */
export interface SelectedTextNoteContextItem extends BaseContextItem {
  type: "selected_text_note";
  /** Selected text content */
  content: string;
  /** Source note path */
  notePath: string;
  /** Source note title */
  noteTitle: string;
  /** Line range of selection */
  startLine: number;
  endLine: number;
}

/**
 * Selected text from web context item
 */
export interface SelectedTextWebContextItem extends BaseContextItem {
  type: "selected_text_web";
  /** Selected text content */
  content: string;
  /** Source URL */
  url: string;
  /** Page title */
  pageTitle: string;
  /** Optional favicon */
  faviconUrl?: string;
}

/**
 * Tag reference context item
 */
export interface TagRefContextItem extends BaseContextItem {
  type: "tag_ref";
  /** The tag including # prefix */
  tag: string;
  /** Notes that have this tag */
  matchingNotes?: string[];
}

/**
 * Folder reference context item
 */
export interface FolderRefContextItem extends BaseContextItem {
  type: "folder_ref";
  /** Folder path */
  path: string;
  /** Notes in this folder */
  matchingNotes?: string[];
}

/**
 * Custom content context item (for arbitrary text)
 */
export interface CustomContentContextItem extends BaseContextItem {
  type: "custom_content";
  /** Custom content */
  content: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Union type for all context items
 */
export type ContextItem =
  | NoteRefContextItem
  | VaultSearchResultContextItem
  | UrlRefContextItem
  | YouTubeTranscriptContextItem
  | WebTabContextItem
  | SelectedTextNoteContextItem
  | SelectedTextWebContextItem
  | TagRefContextItem
  | FolderRefContextItem
  | CustomContentContextItem;

/**
 * Context item with content loaded
 */
export type ContextItemWithContent = ContextItem & { content: string };

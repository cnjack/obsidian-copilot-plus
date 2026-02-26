/**
 * ContextItem Factory Functions
 *
 * Helper functions to create ContextItem instances with proper defaults
 * and ID generation.
 */

import {
  ContextItem,
  ContextSourceType,
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
 * Generate a unique ID for context items
 */
function generateContextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a note reference context item
 */
export function createNoteRefContextItem(params: {
  path: string;
  title: string;
  source?: ContextSourceType;
  section?: string;
  lineStart?: number;
  lineEnd?: number;
  content?: string;
  metadata?: NoteRefContextItem["metadata"];
  isActive?: boolean;
}): NoteRefContextItem {
  return {
    id: generateContextId("note"),
    type: "note_ref",
    title: params.title,
    path: params.path,
    source: params.source || "vault",
    section: params.section,
    lineStart: params.lineStart,
    lineEnd: params.lineEnd,
    content: params.content,
    metadata: params.metadata,
    isActive: params.isActive,
  };
}

/**
 * Create a vault search result context item
 */
export function createVaultSearchResultContextItem(params: {
  path: string;
  title: string;
  content: string;
  score: number;
  explanation?: string;
  section?: string;
}): VaultSearchResultContextItem {
  return {
    id: generateContextId("search"),
    type: "vault_search_result",
    title: params.title,
    path: params.path,
    source: "vault",
    content: params.content,
    score: params.score,
    explanation: params.explanation,
    section: params.section,
  };
}

/**
 * Create a URL reference context item
 */
export function createUrlRefContextItem(params: {
  url: string;
  title: string;
  source?: ContextSourceType;
  faviconUrl?: string;
  content?: string;
  metadata?: UrlRefContextItem["metadata"];
  isActive?: boolean;
}): UrlRefContextItem {
  return {
    id: generateContextId("url"),
    type: "url_ref",
    title: params.title,
    url: params.url,
    source: params.source || "web",
    faviconUrl: params.faviconUrl,
    content: params.content,
    metadata: params.metadata,
    isActive: params.isActive,
  };
}

/**
 * Create a YouTube transcript context item
 */
export function createYouTubeTranscriptContextItem(params: {
  url: string;
  videoId: string;
  title: string;
  content: string;
  duration?: number;
  author?: string;
  fetchedAt?: number;
}): YouTubeTranscriptContextItem {
  return {
    id: generateContextId("youtube"),
    type: "youtube_transcript",
    title: params.title,
    url: params.url,
    videoId: params.videoId,
    source: "web",
    content: params.content,
    duration: params.duration,
    author: params.author,
    fetchedAt: params.fetchedAt || Date.now(),
  };
}

/**
 * Create a web tab context item
 */
export function createWebTabContextItem(params: {
  url: string;
  title: string;
  faviconUrl?: string;
  isLoaded?: boolean;
  content?: string;
  isActive?: boolean;
}): WebTabContextItem {
  return {
    id: generateContextId("webtab"),
    type: "web_tab",
    title: params.title,
    url: params.url,
    source: "web",
    faviconUrl: params.faviconUrl,
    isLoaded: params.isLoaded,
    content: params.content,
    isActive: params.isActive,
  };
}

/**
 * Create a selected text (note) context item
 */
export function createSelectedTextNoteContextItem(params: {
  content: string;
  notePath: string;
  noteTitle: string;
  startLine: number;
  endLine: number;
}): SelectedTextNoteContextItem {
  return {
    id: generateContextId("selected"),
    type: "selected_text_note",
    title: `Selected text from ${params.noteTitle}`,
    source: "vault",
    content: params.content,
    notePath: params.notePath,
    noteTitle: params.noteTitle,
    startLine: params.startLine,
    endLine: params.endLine,
  };
}

/**
 * Create a selected text (web) context item
 */
export function createSelectedTextWebContextItem(params: {
  content: string;
  url: string;
  pageTitle: string;
  faviconUrl?: string;
}): SelectedTextWebContextItem {
  return {
    id: generateContextId("selected"),
    type: "selected_text_web",
    title: `Selected text from ${params.pageTitle}`,
    source: "web",
    content: params.content,
    url: params.url,
    pageTitle: params.pageTitle,
    faviconUrl: params.faviconUrl,
  };
}

/**
 * Create a tag reference context item
 */
export function createTagRefContextItem(params: {
  tag: string;
  title?: string;
  matchingNotes?: string[];
}): TagRefContextItem {
  return {
    id: generateContextId("tag"),
    type: "tag_ref",
    title: params.title || params.tag,
    tag: params.tag,
    source: "vault",
    matchingNotes: params.matchingNotes,
  };
}

/**
 * Create a folder reference context item
 */
export function createFolderRefContextItem(params: {
  path: string;
  title?: string;
  matchingNotes?: string[];
}): FolderRefContextItem {
  return {
    id: generateContextId("folder"),
    type: "folder_ref",
    title: params.title || params.path,
    path: params.path,
    source: "vault",
    matchingNotes: params.matchingNotes,
  };
}

/**
 * Create a custom content context item
 */
export function createCustomContentContextItem(params: {
  content: string;
  title: string;
  source?: ContextSourceType;
  metadata?: Record<string, unknown>;
}): CustomContentContextItem {
  return {
    id: generateContextId("custom"),
    type: "custom_content",
    title: params.title,
    source: params.source || "user",
    content: params.content,
    metadata: params.metadata,
  };
}

/**
 * Create context items from a batch of note paths
 */
export function createNoteRefsFromPaths(params: {
  paths: { path: string; title: string }[];
  source?: ContextSourceType;
}): NoteRefContextItem[] {
  return params.paths.map((p) =>
    createNoteRefContextItem({
      path: p.path,
      title: p.title,
      source: params.source,
    })
  );
}

/**
 * Create context items from search results
 */
export function createSearchResultsFromDocs(params: {
  documents: { path: string; title: string; content: string; score?: number }[];
}): VaultSearchResultContextItem[] {
  return params.documents.map((doc) =>
    createVaultSearchResultContextItem({
      path: doc.path,
      title: doc.title,
      content: doc.content,
      score: doc.score || 0,
    })
  );
}

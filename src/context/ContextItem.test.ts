/**
 * Unit tests for ContextItem data structure
 */

import {
  ContextItem,
  NoteRefContextItem,
  UrlRefContextItem,
} from "./ContextItem";
import {
  createNoteRefContextItem,
  createVaultSearchResultContextItem,
  createUrlRefContextItem,
  createYouTubeTranscriptContextItem,
  createSelectedTextNoteContextItem,
  createTagRefContextItem,
  createNoteRefsFromPaths,
  createSearchResultsFromDocs,
} from "./ContextItemFactory";
import {
  isNoteRefContextItem,
  isVaultSearchResultContextItem,
  isUrlRefContextItem,
  isYouTubeTranscriptContextItem,
  hasContextContent,
  isVaultSource,
  isWebSource,
  validateContextItem,
  getContextIdentifier,
} from "./ContextItemGuards";
import {
  serializeContextItemToXml,
  serializeContextItemsToXml,
  serializeContextItemsGrouped,
  escapeXml,
  getContextSummary,
} from "./ContextItemSerializer";

describe("ContextItem", () => {
  describe("Type Structure", () => {
    test("base context item has required fields", () => {
      const item = createNoteRefContextItem({
        path: "test/path.md",
        title: "Test Note",
      });

      expect(item.id).toBeDefined();
      expect(item.type).toBe("note_ref");
      expect(item.title).toBe("Test Note");
      expect(item.source).toBe("vault");
    });

    test("context item types have type-specific fields", () => {
      const noteItem: NoteRefContextItem = {
        id: "note_1",
        type: "note_ref",
        title: "Test",
        source: "vault",
        path: "test.md",
      };

      expect(noteItem.path).toBe("test.md");

      const urlItem: UrlRefContextItem = {
        id: "url_1",
        type: "url_ref",
        title: "Test",
        source: "web",
        url: "https://example.com",
      };

      expect(urlItem.url).toBe("https://example.com");
    });
  });
});

describe("ContextItemFactory", () => {
  describe("createNoteRefContextItem", () => {
    test("creates note ref with required fields", () => {
      const item = createNoteRefContextItem({
        path: "test/path.md",
        title: "Test Note",
      });

      expect(item.type).toBe("note_ref");
      expect(item.path).toBe("test/path.md");
      expect(item.title).toBe("Test Note");
      expect(item.source).toBe("vault");
      expect(item.id).toMatch(/^note_/);
    });

    test("creates note ref with optional fields", () => {
      const item = createNoteRefContextItem({
        path: "test/path.md",
        title: "Test Note",
        section: "Heading",
        lineStart: 10,
        lineEnd: 20,
        content: "Some content",
        metadata: { tags: ["tag1", "tag2"] },
        isActive: true,
      });

      expect(item.section).toBe("Heading");
      expect(item.lineStart).toBe(10);
      expect(item.lineEnd).toBe(20);
      expect(item.content).toBe("Some content");
      expect(item.metadata?.tags).toEqual(["tag1", "tag2"]);
      expect(item.isActive).toBe(true);
    });

    test("allows custom source", () => {
      const item = createNoteRefContextItem({
        path: "test.md",
        title: "Test",
        source: "user",
      });

      expect(item.source).toBe("user");
    });
  });

  describe("createVaultSearchResultContextItem", () => {
    test("creates search result with required fields", () => {
      const item = createVaultSearchResultContextItem({
        path: "test.md",
        title: "Test Note",
        content: "Matching content",
        score: 0.85,
      });

      expect(item.type).toBe("vault_search_result");
      expect(item.path).toBe("test.md");
      expect(item.content).toBe("Matching content");
      expect(item.score).toBe(0.85);
    });

    test("includes optional explanation", () => {
      const item = createVaultSearchResultContextItem({
        path: "test.md",
        title: "Test",
        content: "Content",
        score: 0.9,
        explanation: "Matched on keyword",
      });

      expect(item.explanation).toBe("Matched on keyword");
    });
  });

  describe("createUrlRefContextItem", () => {
    test("creates URL ref with required fields", () => {
      const item = createUrlRefContextItem({
        url: "https://example.com",
        title: "Example",
      });

      expect(item.type).toBe("url_ref");
      expect(item.url).toBe("https://example.com");
      expect(item.source).toBe("web");
    });

    test("includes optional metadata", () => {
      const item = createUrlRefContextItem({
        url: "https://example.com",
        title: "Example",
        faviconUrl: "https://example.com/favicon.ico",
        metadata: { domain: "example.com" },
      });

      expect(item.faviconUrl).toBe("https://example.com/favicon.ico");
      expect(item.metadata?.domain).toBe("example.com");
    });
  });

  describe("createYouTubeTranscriptContextItem", () => {
    test("creates YouTube transcript with required fields", () => {
      const item = createYouTubeTranscriptContextItem({
        url: "https://youtube.com/watch?v=abc123",
        videoId: "abc123",
        title: "Video Title",
        content: "Transcript content",
      });

      expect(item.type).toBe("youtube_transcript");
      expect(item.videoId).toBe("abc123");
      expect(item.content).toBe("Transcript content");
      expect(item.fetchedAt).toBeDefined();
    });

    test("includes optional duration and author", () => {
      const item = createYouTubeTranscriptContextItem({
        url: "https://youtube.com/watch?v=abc123",
        videoId: "abc123",
        title: "Video",
        content: "Content",
        duration: 300,
        author: "Channel Name",
      });

      expect(item.duration).toBe(300);
      expect(item.author).toBe("Channel Name");
    });
  });

  describe("createSelectedTextNoteContextItem", () => {
    test("creates selected text note with required fields", () => {
      const item = createSelectedTextNoteContextItem({
        content: "Selected text",
        notePath: "test.md",
        noteTitle: "Test Note",
        startLine: 5,
        endLine: 10,
      });

      expect(item.type).toBe("selected_text_note");
      expect(item.content).toBe("Selected text");
      expect(item.notePath).toBe("test.md");
      expect(item.startLine).toBe(5);
      expect(item.endLine).toBe(10);
    });
  });

  describe("createTagRefContextItem", () => {
    test("creates tag ref with required fields", () => {
      const item = createTagRefContextItem({
        tag: "#test",
      });

      expect(item.type).toBe("tag_ref");
      expect(item.tag).toBe("#test");
      expect(item.title).toBe("#test");
    });

    test("uses custom title when provided", () => {
      const item = createTagRefContextItem({
        tag: "#test",
        title: "Test Tag",
      });

      expect(item.title).toBe("Test Tag");
    });
  });

  describe("Batch creation functions", () => {
    test("createNoteRefsFromPaths creates multiple items", () => {
      const items = createNoteRefsFromPaths({
        paths: [
          { path: "note1.md", title: "Note 1" },
          { path: "note2.md", title: "Note 2" },
        ],
      });

      expect(items).toHaveLength(2);
      expect(items[0].type).toBe("note_ref");
      expect(items[0].path).toBe("note1.md");
      expect(items[1].path).toBe("note2.md");
    });

    test("createSearchResultsFromDocs creates search results", () => {
      const items = createSearchResultsFromDocs({
        documents: [
          { path: "note1.md", title: "Note 1", content: "Content 1", score: 0.9 },
          { path: "note2.md", title: "Note 2", content: "Content 2" },
        ],
      });

      expect(items).toHaveLength(2);
      expect(items[0].score).toBe(0.9);
      expect(items[1].score).toBe(0); // Default score
    });
  });
});

describe("ContextItemGuards", () => {
  describe("Type guards", () => {
    test("isNoteRefContextItem identifies note refs", () => {
      const item = createNoteRefContextItem({ path: "test.md", title: "Test" });
      expect(isNoteRefContextItem(item)).toBe(true);
      expect(isVaultSearchResultContextItem(item)).toBe(false);
    });

    test("isUrlRefContextItem identifies URL refs", () => {
      const item = createUrlRefContextItem({ url: "https://example.com", title: "Example" });
      expect(isUrlRefContextItem(item)).toBe(true);
      expect(isNoteRefContextItem(item)).toBe(false);
    });

    test("isYouTubeTranscriptContextItem identifies YouTube transcripts", () => {
      const item = createYouTubeTranscriptContextItem({
        url: "https://youtube.com/watch?v=abc",
        videoId: "abc",
        title: "Video",
        content: "Content",
      });
      expect(isYouTubeTranscriptContextItem(item)).toBe(true);
    });
  });

  describe("Source guards", () => {
    test("isVaultSource identifies vault items", () => {
      const noteItem = createNoteRefContextItem({ path: "test.md", title: "Test" });
      expect(isVaultSource(noteItem)).toBe(true);
      expect(isWebSource(noteItem)).toBe(false);
    });

    test("isWebSource identifies web items", () => {
      const urlItem = createUrlRefContextItem({ url: "https://example.com", title: "Example" });
      expect(isWebSource(urlItem)).toBe(true);
      expect(isVaultSource(urlItem)).toBe(false);
    });
  });

  describe("Content guards", () => {
    test("hasContextContent returns true for items with content", () => {
      const item = createVaultSearchResultContextItem({
        path: "test.md",
        title: "Test",
        content: "Content",
        score: 0.5,
      });
      expect(hasContextContent(item)).toBe(true);
    });

    test("hasContextContent returns false for items without content", () => {
      const item = createNoteRefContextItem({ path: "test.md", title: "Test" });
      expect(hasContextContent(item)).toBe(false);
    });
  });

  describe("getContextIdentifier", () => {
    test("returns path for note refs", () => {
      const item = createNoteRefContextItem({ path: "test.md", title: "Test" });
      expect(getContextIdentifier(item)).toBe("test.md");
    });

    test("returns URL for URL refs", () => {
      const item = createUrlRefContextItem({ url: "https://example.com", title: "Example" });
      expect(getContextIdentifier(item)).toBe("https://example.com");
    });

    test("returns tag for tag refs", () => {
      const item = createTagRefContextItem({ tag: "#test" });
      expect(getContextIdentifier(item)).toBe("#test");
    });
  });

  describe("validateContextItem", () => {
    test("validates correct item", () => {
      const item = createNoteRefContextItem({ path: "test.md", title: "Test" });
      const result = validateContextItem(item);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("detects missing required fields", () => {
      const invalidItem = {
        id: "test",
        type: "note_ref" as const,
        title: "",
        source: "vault" as const,
        // Missing path
      };
      const result = validateContextItem(invalidItem as unknown as ContextItem);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("path"))).toBe(true);
    });
  });
});

describe("ContextItemSerializer", () => {
  describe("escapeXml", () => {
    test("escapes XML special characters", () => {
      expect(escapeXml("<test>")).toBe("&lt;test&gt;");
      expect(escapeXml('quote"test')).toBe("quote&quot;test");
      expect(escapeXml("test&test")).toBe("test&amp;test");
    });
  });

  describe("serializeContextItemToXml", () => {
    test("serializes note ref to XML", () => {
      const item = createNoteRefContextItem({
        path: "test.md",
        title: "Test Note",
        content: "Content",
      });

      const xml = serializeContextItemToXml(item);
      expect(xml).toContain('<note title="Test Note" path="test.md"');
      expect(xml).toContain("Content");
      expect(xml).toContain("</note>");
    });

    test("serializes URL ref to XML", () => {
      const item = createUrlRefContextItem({
        url: "https://example.com",
        title: "Example",
      });

      const xml = serializeContextItemToXml(item);
      expect(xml).toContain('<url title="Example" url="https://example.com"');
    });

    test("serializes search result with score", () => {
      const item = createVaultSearchResultContextItem({
        path: "test.md",
        title: "Test",
        content: "Content",
        score: 0.85,
      });

      const xml = serializeContextItemToXml(item);
      expect(xml).toContain('score="0.85"');
    });

    test("serializes YouTube transcript", () => {
      const item = createYouTubeTranscriptContextItem({
        url: "https://youtube.com/watch?v=abc",
        videoId: "abc",
        title: "Video",
        content: "Transcript",
        duration: 300,
      });

      const xml = serializeContextItemToXml(item);
      expect(xml).toContain('videoId="abc"');
      expect(xml).toContain('duration="300"');
    });
  });

  describe("serializeContextItemsToXml", () => {
    test("serializes multiple items", () => {
      const items: ContextItem[] = [
        createNoteRefContextItem({ path: "note1.md", title: "Note 1" }),
        createUrlRefContextItem({ url: "https://example.com", title: "Example" }),
      ];

      const xml = serializeContextItemsToXml(items);
      expect(xml).toContain("<note");
      expect(xml).toContain("<url");
    });

    test("returns empty string for empty array", () => {
      const xml = serializeContextItemsToXml([]);
      expect(xml).toBe("");
    });
  });

  describe("serializeContextItemsGrouped", () => {
    test("groups items by type", () => {
      const items: ContextItem[] = [
        createNoteRefContextItem({ path: "note1.md", title: "Note 1" }),
        createNoteRefContextItem({ path: "note2.md", title: "Note 2" }),
        createUrlRefContextItem({ url: "https://example.com", title: "Example" }),
      ];

      const grouped = serializeContextItemsGrouped(items);
      expect(grouped.note_ref).toBeDefined();
      expect(grouped.url_ref).toBeDefined();
      expect(grouped.note_ref).toContain("note1.md");
      expect(grouped.note_ref).toContain("note2.md");
    });
  });

  describe("getContextSummary", () => {
    test("returns correct summary", () => {
      const items: ContextItem[] = [
        createNoteRefContextItem({ path: "note1.md", title: "Note 1" }),
        createNoteRefContextItem({ path: "note2.md", title: "Note 2" }),
        createUrlRefContextItem({ url: "https://example.com", title: "Example" }),
      ];

      const summary = getContextSummary(items);
      expect(summary.total).toBe(3);
      expect(summary.byType.note_ref).toBe(2);
      expect(summary.byType.url_ref).toBe(1);
      expect(summary.bySource.vault).toBe(2);
      expect(summary.bySource.web).toBe(1);
    });
  });
});

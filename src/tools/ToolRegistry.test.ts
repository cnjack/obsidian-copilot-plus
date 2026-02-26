/**
 * Tests for ToolRegistry with permission checking and execution logic
 */

import { z } from "zod";
import { ToolRegistry, ToolDefinition, ToolPermission } from "./ToolRegistry";
import { createLangChainTool } from "./createLangChainTool";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  // Helper to create test tools
  const createTestTool = (
    id: string,
    options?: {
      permission?: ToolPermission;
      isPlusOnly?: boolean;
      requiresVault?: boolean;
      allowsAnnotatedOnly?: boolean;
      timeoutMs?: number;
      category?: "search" | "time" | "file" | "media" | "mcp" | "memory" | "custom";
      isAlwaysEnabled?: boolean;
    }
  ): ToolDefinition => {
    const tool = createLangChainTool({
      name: id,
      description: `Test tool ${id}`,
      schema: z.object({
        input: z.string().optional(),
      }),
      func: async (args: { input?: string }) => {
        return `Executed ${id} with input: ${args.input || "none"}`;
      },
    });

    return {
      tool,
      metadata: {
        id,
        displayName: id,
        description: `Test tool ${id}`,
        category: options?.category || "custom",
        permission: options?.permission,
        isPlusOnly: options?.isPlusOnly,
        requiresVault: options?.requiresVault,
        allowsAnnotatedOnly: options?.allowsAnnotatedOnly,
        timeoutMs: options?.timeoutMs,
        isAlwaysEnabled: options?.isAlwaysEnabled,
      },
    };
  };

  beforeEach(() => {
    registry = ToolRegistry.getInstance();
    registry.clear();
  });

  describe("Registration", () => {
    test("registers a single tool", () => {
      const tool = createTestTool("echo");
      registry.register(tool);

      expect(registry.isRegistered("echo")).toBe(true);
      expect(registry.getToolDefinition("echo")).toBe(tool);
    });

    test("registers multiple tools at once", () => {
      const tools: ToolDefinition[] = [
        createTestTool("tool1"),
        createTestTool("tool2"),
        createTestTool("tool3"),
      ];

      registry.registerAll(tools);

      expect(registry.isRegistered("tool1")).toBe(true);
      expect(registry.isRegistered("tool2")).toBe(true);
      expect(registry.isRegistered("tool3")).toBe(true);
      expect(registry.getAllTools().length).toBe(3);
    });

    test("unregisters a tool", () => {
      registry.register(createTestTool("echo"));
      expect(registry.isRegistered("echo")).toBe(true);

      const result = registry.unregister("echo");
      expect(result).toBe(true);
      expect(registry.isRegistered("echo")).toBe(false);
    });

    test("unregister returns false for non-existent tool", () => {
      const result = registry.unregister("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("Permission Checking", () => {
    test("allows read tool with basic context", () => {
      registry.register(
        createTestTool("readTool", { permission: "read" })
      );

      const result = registry.checkPermission("readTool", {
        hasPlusLicense: false,
        vaultAvailable: false,
        hasWritePermission: false,
      });

      expect(result.allowed).toBe(true);
    });

    test("blocks write tool without write permission", () => {
      registry.register(
        createTestTool("writeTool", { permission: "write" })
      );

      const result = registry.checkPermission("writeTool", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("write permission");
    });

    test("allows write tool with write permission", () => {
      registry.register(
        createTestTool("writeTool", { permission: "write" })
      );

      const result = registry.checkPermission("writeTool", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: true,
      });

      expect(result.allowed).toBe(true);
    });

    test("allows Plus-only tool without Plus license (Plus gating removed)", () => {
      // Note: Plus license gating has been removed - all tools are now available
      // regardless of license status. The isPlusOnly metadata property is kept
      // for backwards compatibility but no longer affects permission checks.
      registry.register(
        createTestTool("plusTool", { isPlusOnly: true })
      );

      const result = registry.checkPermission("plusTool", {
        hasPlusLicense: false,
        vaultAvailable: true,
        hasWritePermission: true,
      });

      expect(result.allowed).toBe(true);
    });

    test("allows Plus-only tool with Plus license (Plus gating removed)", () => {
      // Note: Plus license gating has been removed. This test verifies backwards
      // compatibility - tools with isPlusOnly=true are still allowed regardless
      // of license status.
      registry.register(
        createTestTool("plusTool", { isPlusOnly: true })
      );

      const result = registry.checkPermission("plusTool", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: true,
      });

      expect(result.allowed).toBe(true);
    });

    test("blocks vault tool without vault", () => {
      registry.register(
        createTestTool("vaultTool", { requiresVault: true })
      );

      const result = registry.checkPermission("vaultTool", {
        hasPlusLicense: true,
        vaultAvailable: false,
        hasWritePermission: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("vault access");
    });

    test("allows vault tool with vault available", () => {
      registry.register(
        createTestTool("vaultTool", { requiresVault: true })
      );

      const result = registry.checkPermission("vaultTool", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: true,
      });

      expect(result.allowed).toBe(true);
    });

    test("blocks annotated-only tool on non-annotated file", () => {
      registry.register(
        createTestTool("annotatedTool", { allowsAnnotatedOnly: true })
      );

      const result = registry.checkPermission("annotatedTool", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: true,
        isAnnotatedFile: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("annotated");
    });

    test("allows annotated-only tool on annotated file", () => {
      registry.register(
        createTestTool("annotatedTool", { allowsAnnotatedOnly: true })
      );

      const result = registry.checkPermission("annotatedTool", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: true,
        isAnnotatedFile: true,
      });

      expect(result.allowed).toBe(true);
    });

    test("returns tool not found for unknown tool", () => {
      const result = registry.checkPermission("nonexistent", {
        hasPlusLicense: true,
        vaultAvailable: true,
        hasWritePermission: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  describe("Tool Execution", () => {
    test("executes a tool successfully", async () => {
      const echoTool = createLangChainTool({
        name: "echo",
        description: "Echo tool",
        schema: z.object({
          input: z.string().optional(),
        }),
        func: async (args: { input?: string }) => `Echo: ${args.input}`,
      });
      registry.register({
        tool: echoTool,
        metadata: {
          id: "echo",
          displayName: "echo",
          description: "Echo tool",
          category: "custom",
        },
      });

      const result = await registry.executeTool("echo", { input: "hello" });

      expect(result.success).toBe(true);
      expect(result.result).toContain("Echo: hello");
      expect(result.executionTimeMs).toBeDefined();
    });

    test("returns error for non-existent tool", async () => {
      const result = await registry.executeTool("nonexistent", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    test("validates arguments against schema", async () => {
      const strictTool = createLangChainTool({
        name: "strict",
        description: "Strict tool",
        schema: z.object({
          required: z.string(),
        }),
        func: async ({ required }) => `Got: ${required}`,
      });

      registry.register({
        tool: strictTool,
        metadata: {
          id: "strict",
          displayName: "strict",
          description: "Strict tool",
          category: "custom",
        },
      });

      // Missing required field should fail
      const result = await registry.executeTool("strict", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid");
    });

    test("respects tool timeout", async () => {
      const slowTool = createLangChainTool({
        name: "slow",
        description: "Slow tool",
        schema: z.object({}),
        func: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return "Done";
        },
      });

      registry.register({
        tool: slowTool,
        metadata: {
          id: "slow",
          displayName: "slow",
          description: "Slow tool",
          category: "custom",
          timeoutMs: 100, // Very short timeout
        },
      });

      const result = await registry.executeTool("slow", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    test("respects custom timeout option", async () => {
      const slowTool = createLangChainTool({
        name: "slow",
        description: "Slow tool",
        schema: z.object({}),
        func: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return "Done";
        },
      });

      registry.register({
        tool: slowTool,
        metadata: {
          id: "slow",
          displayName: "slow",
          description: "Slow tool",
          category: "custom",
        },
      });

      const result = await registry.executeTool("slow", {}, { timeoutMs: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });
  });

  describe("JSON Schema Generation", () => {
    test("generates JSON schema for tool parameters", () => {
      const tool = createLangChainTool({
        name: "search",
        description: "Search tool",
        schema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().optional(),
        }),
        func: async ({ query, limit }) => `Search: ${query}, ${limit}`,
      });

      registry.register({
        tool,
        metadata: {
          id: "search",
          displayName: "search",
          description: "Search tool",
          category: "search",
        },
      });

      const schema = registry.getToolJsonSchema("search");

      expect(schema).toBeDefined();
      expect(schema?.type).toBe("object");
      expect(schema?.properties?.query?.type).toBe("string");
      expect(schema?.properties?.query?.description).toBe("Search query");
      expect(schema?.required).toContain("query");
      expect(schema?.required).not.toContain("limit");
    });

    test("returns undefined for non-existent tool", () => {
      const schema = registry.getToolJsonSchema("nonexistent");
      expect(schema).toBeUndefined();
    });

    test("handles void schema (no parameters)", () => {
      const tool = createLangChainTool({
        name: "empty",
        description: "Empty tool",
        schema: z.void(),
        func: async () => "Done",
      });

      registry.register({
        tool,
        metadata: {
          id: "empty",
          displayName: "empty",
          description: "Empty tool",
          category: "custom",
        },
      });

      const schema = registry.getToolJsonSchema("empty");

      expect(schema?.type).toBe("object");
      expect(schema?.properties).toEqual({});
      expect(schema?.required).toEqual([]);
    });
  });

  describe("Filtering and Querying", () => {
    test("gets tools by category", () => {
      registry.registerAll([
        createTestTool("search1", { category: "search" as any }),
        createTestTool("search2", { category: "search" as any }),
        createTestTool("file1", { category: "file" as any }),
        createTestTool("time1", { category: "time" as any }),
      ]);

      const byCategory = registry.getToolsByCategory();

      expect(byCategory.get("search")?.length).toBe(2);
      expect(byCategory.get("file")?.length).toBe(1);
      expect(byCategory.get("time")?.length).toBe(1);
    });

    test("gets only configurable tools", () => {
      registry.registerAll([
        createTestTool("always", { isAlwaysEnabled: true }),
        createTestTool("config1"),
        createTestTool("config2"),
      ]);

      const configurable = registry.getConfigurableTools();

      expect(configurable.length).toBe(2);
      expect(configurable.some((t) => t.metadata.id === "always")).toBe(false);
    });

    test("gets tools by permission level", () => {
      registry.registerAll([
        createTestTool("read1", { permission: "read" }),
        createTestTool("read2", { permission: "read" }),
        createTestTool("write1", { permission: "write" }),
        createTestTool("admin1", { permission: "admin" }),
      ]);

      const readTools = registry.getToolsByPermission("read");
      const writeTools = registry.getToolsByPermission("write");
      const adminTools = registry.getToolsByPermission("admin");

      expect(readTools.length).toBe(2);
      expect(writeTools.length).toBe(1);
      expect(adminTools.length).toBe(1);
    });

    test("gets write-capable tools", () => {
      registry.registerAll([
        createTestTool("read1", { permission: "read" }),
        createTestTool("write1", { permission: "write" }),
        createTestTool("admin1", { permission: "admin" }),
      ]);

      const writeCapable = registry.getWriteCapableTools();

      expect(writeCapable.length).toBe(2);
      expect(writeCapable.some((t) => t.metadata.permission === "read")).toBe(false);
    });

    test("gets enabled tools with vault filter", () => {
      registry.registerAll([
        createTestTool("always", { isAlwaysEnabled: true }),
        createTestTool("vault", { requiresVault: true, isAlwaysEnabled: true }),
        createTestTool("novault"),
      ]);

      // Without vault - only always-enabled tools without vault requirement
      const withoutVault = registry.getEnabledTools(new Set(), false);
      expect(withoutVault.length).toBe(1); // only "always"
      expect(withoutVault.some((t) => t.name === "vault")).toBe(false);
      expect(withoutVault.some((t) => t.name === "always")).toBe(true);

      // With vault - all always-enabled tools including vault-requiring ones
      const withVault = registry.getEnabledTools(new Set(), true);
      expect(withVault.length).toBe(2); // always + vault
      expect(withVault.some((t) => t.name === "always")).toBe(true);
      expect(withVault.some((t) => t.name === "vault")).toBe(true);
    });

    test("gets enabled tools with user-enabled filter", () => {
      registry.registerAll([
        createTestTool("tool1"),
        createTestTool("tool2"),
        createTestTool("tool3"),
      ]);

      const enabled = registry.getEnabledTools(new Set(["tool1", "tool3"]), true);

      expect(enabled.length).toBe(2);
      expect(enabled.some((t) => t.name === "tool1")).toBe(true);
      expect(enabled.some((t) => t.name === "tool3")).toBe(true);
      expect(enabled.some((t) => t.name === "tool2")).toBe(false);
    });
  });

  describe("Copilot Commands", () => {
    test("builds command mappings", () => {
      registry.registerAll([
        {
          tool: createTestTool("vault").tool,
          metadata: {
            id: "vault",
            displayName: "Vault",
            description: "Vault tool",
            category: "search",
            copilotCommands: ["@vault"],
          },
        },
        {
          tool: createTestTool("web").tool,
          metadata: {
            id: "web",
            displayName: "Web",
            description: "Web tool",
            category: "search",
            copilotCommands: ["@websearch", "@web"],
          },
        },
      ]);

      const mappings = registry.getCopilotCommandMappings();

      expect(mappings.get("@vault")?.metadata.id).toBe("vault");
      expect(mappings.get("@websearch")?.metadata.id).toBe("web");
      expect(mappings.get("@web")?.metadata.id).toBe("web");
    });

    test("normalizes commands to lowercase", () => {
      registry.register({
        tool: createTestTool("vault").tool,
        metadata: {
          id: "vault",
          displayName: "Vault",
          description: "Vault tool",
          category: "search",
          copilotCommands: ["@Vault", "@VAULT"],
        },
      });

      const mappings = registry.getCopilotCommandMappings();

      expect(mappings.get("@vault")).toBeDefined();
    });
  });

  describe("Tools with Schemas for LLM", () => {
    test("gets tools with JSON schemas for LLM registration", () => {
      const searchTool = createLangChainTool({
        name: "search",
        description: "Search the vault",
        schema: z.object({
          query: z.string().describe("Search query"),
        }),
        func: async ({ query }) => `Search: ${query}`,
      });

      registry.register({
        tool: searchTool,
        metadata: {
          id: "search",
          displayName: "Search",
          description: "Search tool",
          category: "search",
        },
      });

      const toolsWithSchemas = registry.getToolsWithSchemas(new Set(["search"]), true);

      expect(toolsWithSchemas.length).toBe(1);
      expect(toolsWithSchemas[0].name).toBe("search");
      expect(toolsWithSchemas[0].description).toBe("Search the vault");
      expect(toolsWithSchemas[0].parameters?.type).toBe("object");
    });
  });
});

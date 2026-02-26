import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { zodToJsonSchema, JSONSchema } from "./zodToJsonSchema";

/**
 * Permission levels for tool execution
 */
export type ToolPermission = "read" | "write" | "admin";

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: ToolPermission;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  executionTimeMs?: number;
}

/**
 * Tool metadata for registration and UI display.
 * Contains tool configuration including execution control properties.
 */
export interface ToolMetadata {
  id: string;
  displayName: string;
  description: string;
  category: "search" | "time" | "file" | "media" | "mcp" | "memory" | "custom";
  isAlwaysEnabled?: boolean; // Tools that are always available (e.g., time tools)
  requiresVault?: boolean; // Tools that need vault access
  customPromptInstructions?: string; // Optional custom instructions for this tool
  copilotCommands?: string[]; // Optional Copilot slash command aliases (e.g., "@vault")
  // Execution control properties
  timeoutMs?: number;
  isBackground?: boolean; // If true, tool execution is not shown to user
  isPlusOnly?: boolean; // If true, tool requires Plus subscription
  requiresUserMessageContent?: boolean; // If true, tool receives original user message for URL extraction
  // Permission properties
  permission?: ToolPermission; // Required permission level (default: "read")
  allowsAnnotatedOnly?: boolean; // If true, only allows operations on annotated files
}

/**
 * Complete tool definition including implementation and metadata
 */
export interface ToolDefinition {
  tool: StructuredTool; // LangChain native tool - compatible with bindTools()
  metadata: ToolMetadata;
}

/**
 * Central registry for all tools available to the autonomous agent
 */
export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, ToolDefinition> = new Map();

  private constructor() {}

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool with the registry
   */
  register(definition: ToolDefinition): void {
    this.tools.set(definition.metadata.id, definition);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(definitions: ToolDefinition[]): void {
    definitions.forEach((def) => this.register(def));
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools filtered by enabled status
   * Returns LangChain StructuredTool instances ready for bindTools()
   */
  getEnabledTools(enabledToolIds: Set<string>, vaultAvailable: boolean): StructuredTool[] {
    const enabledTools: StructuredTool[] = [];

    for (const [id, definition] of this.tools) {
      const { metadata, tool } = definition;

      // Always include tools marked as always enabled
      if (metadata.isAlwaysEnabled) {
        // Skip vault-required tools if vault is not available
        if (!metadata.requiresVault || vaultAvailable) {
          enabledTools.push(tool);
        }
        continue;
      }

      // Include user-enabled tools
      if (enabledToolIds.has(id)) {
        // Skip vault-required tools if vault is not available
        if (!metadata.requiresVault || vaultAvailable) {
          enabledTools.push(tool);
        }
      }
    }

    return enabledTools;
  }

  /**
   * Get tool metadata by category for UI organization
   */
  getToolsByCategory(): Map<string, ToolDefinition[]> {
    const byCategory = new Map<string, ToolDefinition[]>();

    for (const definition of this.tools.values()) {
      const category = definition.metadata.category;
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(definition);
    }

    return byCategory;
  }

  /**
   * Get configurable tools (excludes always-enabled tools)
   */
  getConfigurableTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((def) => !def.metadata.isAlwaysEnabled);
  }

  /**
   * Build a map of Copilot command aliases to tool definitions.
   *
   * @returns Map keyed by lower-case Copilot command aliases pointing to their tool definitions.
   */
  getCopilotCommandMappings(): Map<string, ToolDefinition> {
    const mappings = new Map<string, ToolDefinition>();

    for (const definition of this.tools.values()) {
      const commands = definition.metadata.copilotCommands;

      if (!commands) {
        continue;
      }

      for (const command of commands) {
        const normalizedCommand = command.toLowerCase();

        if (!mappings.has(normalizedCommand)) {
          mappings.set(normalizedCommand, definition);
        }
      }
    }

    return mappings;
  }

  /**
   * Get tool metadata by ID
   */
  getToolMetadata(id: string): ToolMetadata | undefined {
    return this.tools.get(id)?.metadata;
  }

  /**
   * Get tool definition by ID
   */
  getToolDefinition(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  /**
   * Clear the registry (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Clear only non-MCP tools, preserving MCP tools registered by MCPManager.
   * Used by initializeBuiltinTools to reinitialize builtins without disconnecting MCP servers.
   */
  clearBuiltins(): void {
    for (const [id, def] of this.tools) {
      if (def.metadata.category !== "mcp") {
        this.tools.delete(id);
      }
    }
  }

  /**
   * Clear only MCP tools, used by MCPManager when reinitializing connections.
   */
  clearMCPTools(): void {
    for (const [id, def] of this.tools) {
      if (def.metadata.category === "mcp") {
        this.tools.delete(id);
      }
    }
  }

  /**
   * Check if a tool can be executed based on permissions and context
   */
  checkPermission(toolId: string, context: {
    hasPlusLicense: boolean;
    vaultAvailable: boolean;
    hasWritePermission: boolean;
    isAnnotatedFile?: boolean;
  }): PermissionCheckResult {
    const definition = this.tools.get(toolId);

    if (!definition) {
      return {
        allowed: false,
        reason: `Tool '${toolId}' not found`,
      };
    }

    const { metadata } = definition;

    // Plus license check removed - all tools are now available without license validation

    // Check vault requirement
    if (metadata.requiresVault && !context.vaultAvailable) {
      return {
        allowed: false,
        reason: "Tool requires vault access",
        requiredPermission: metadata.permission,
      };
    }

    // Check write permission for write/admin tools
    const requiredPermission = metadata.permission || "read";
    if (requiredPermission === "write" && !context.hasWritePermission) {
      return {
        allowed: false,
        reason: "Tool requires write permission",
        requiredPermission: "write",
      };
    }

    if (requiredPermission === "admin" && !context.hasWritePermission) {
      return {
        allowed: false,
        reason: "Tool requires admin permission",
        requiredPermission: "admin",
      };
    }

    // Check annotated-only restriction
    if (metadata.allowsAnnotatedOnly && !context.isAnnotatedFile) {
      return {
        allowed: false,
        reason: "Tool can only operate on annotated/selected files",
        requiredPermission: metadata.permission,
      };
    }

    return {
      allowed: true,
      requiredPermission: metadata.permission,
    };
  }

  /**
   * Execute a tool with timeout and error handling
   */
  async executeTool(
    toolId: string,
    args: Record<string, unknown>,
    options: {
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<ToolExecutionResult> {
    const definition = this.tools.get(toolId);

    if (!definition) {
      return {
        success: false,
        error: `Tool '${toolId}' not found`,
      };
    }

    const { tool, metadata } = definition;
    const startTime = Date.now();
    const timeout = options.timeoutMs || metadata.timeoutMs || 30000; // Default 30s

    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error(`Tool execution timeout: ${toolId}`));
    }, timeout);

    // Also respect external abort signal
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        abortController.abort(options.signal?.reason);
      }, { once: true });
    }

    try {
      // Validate args against schema first
      // Cast to z.ZodType to access safeParse method
      const schemaAsZod = tool.schema as unknown as z.ZodType;
      const validationResult = schemaAsZod?.safeParse(args);
      if (validationResult && !validationResult.success) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: `Invalid arguments: ${validationResult.error.message}`,
        };
      }

      // Execute the tool
      const result = await tool.call(args, {
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result: typeof result === "string" ? result : JSON.stringify(result),
        executionTimeMs: executionTime,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      const executionTime = Date.now() - startTime;

      // Check if it was an abort
      if (error.name === "AbortError" || error.message?.includes("timeout")) {
        return {
          success: false,
          error: `Tool execution timed out after ${timeout}ms`,
          executionTimeMs: executionTime,
        };
      }

      return {
        success: false,
        error: error.message || `Error executing tool '${toolId}'`,
        executionTimeMs: executionTime,
      };
    }
  }

  /**
   * Get JSON Schema for a tool's parameters
   * Used for LLM tool descriptions
   */
  getToolJsonSchema(toolId: string): JSONSchema | undefined {
    const definition = this.tools.get(toolId);
    if (!definition) {
      return undefined;
    }

    const { tool } = definition;

    // Cast to z.ZodType for type compatibility
    const schemaAsZod = tool.schema as unknown as z.ZodType;

    // Handle void schema (no parameters)
    if (schemaAsZod instanceof z.ZodVoid) {
      return {
        type: "object",
        properties: {},
        required: [],
      };
    }

    // Convert Zod schema to JSON Schema
    return zodToJsonSchema(schemaAsZod);
  }

  /**
   * Get all tools with their JSON schemas for LLM tool registration
   */
  getToolsWithSchemas(enabledToolIds: Set<string>, vaultAvailable: boolean): Array<{
    name: string;
    description: string;
    parameters: JSONSchema;
  }> {
    const tools = this.getEnabledTools(enabledToolIds, vaultAvailable);

    return tools.map((tool) => {
      // Cast to z.ZodType for type compatibility
      const schemaAsZod = tool.schema as unknown as z.ZodType;
      return {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(schemaAsZod),
      };
    });
  }

  /**
   * Unregister a tool by ID
   */
  unregister(toolId: string): boolean {
    if (this.tools.has(toolId)) {
      this.tools.delete(toolId);
      return true;
    }
    return false;
  }

  /**
   * Check if a tool is registered
   */
  isRegistered(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get tools by permission level
   */
  getToolsByPermission(permission: ToolPermission): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (def) => (def.metadata.permission || "read") === permission
    );
  }

  /**
   * Get write-capable tools (for permission prompts)
   */
  getWriteCapableTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (def) => def.metadata.permission === "write" || def.metadata.permission === "admin"
    );
  }
}

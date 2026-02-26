/**
 * MCPManager - Manages Model Context Protocol (MCP) server connections and tool registration.
 *
 * Reads mcpServersConfig from settings, connects to configured MCP servers via stdio (local)
 * or HTTP/SSE (remote), and registers each server's tools into the ToolRegistry as LangChain
 * StructuredTool instances.
 *
 * Config format (same as Claude Desktop):
 * Stdio servers:
 * ```json
 * {
 *   "my-server": {
 *     "command": "npx",
 *     "args": ["-y", "mcp-server-package"],
 *     "env": { "API_KEY": "value" }
 *   }
 * }
 * ```
 * Remote (HTTP/SSE) servers:
 * ```json
 * {
 *   "my-remote": {
 *     "url": "https://example.com/mcp",
 *     "headers": {
 *       "Authorization": "Bearer <token>"
 *     }
 *   },
 *   "my-sse-server": {
 *     "type": "sse",
 *     "url": "https://example.com/mcp/sse",
 *     "headers": {
 *       "Authorization": "Bearer <token>"
 *     }
 *   }
 * }
 * ```
 * Set `"type": "sse"` to skip the StreamableHTTP attempt and connect directly via SSE.
 * Set `"type": "streamable-http"` to force StreamableHTTP with no SSE fallback.
 * Omit `type` to auto-detect (tries StreamableHTTP first, falls back to SSE).
 */

import { logError, logInfo, logWarn } from "@/logger";
import { tool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { ToolDefinition, ToolRegistry } from "./ToolRegistry";

/**
 * Configuration for an MCP server.
 * Use `command` (+ optional `args`, `env`) for local stdio servers.
 * Use `url` for remote HTTP/SSE servers.
 */
interface MCPServerConfig {
  /** Executable command for stdio-based local servers (e.g. "npx"). */
  command?: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Extra environment variables injected into the server process. */
  env?: Record<string, string>;
  /** HTTP/SSE endpoint URL for remote servers. */
  url?: string;
  /** Optional HTTP headers to include with remote server requests (e.g. Authorization). */
  headers?: Record<string, string>;
  /**
   * Transport type for remote servers.
   * - `"sse"`: Use legacy SSE transport directly (skip StreamableHTTP attempt).
   * - `"streamable-http"`: Use StreamableHTTP only (no SSE fallback).
   * - Omitted: Try StreamableHTTP first, fall back to SSE automatically.
   */
  type?: "sse" | "streamable-http";
}

interface MCPServersConfig {
  [serverName: string]: MCPServerConfig;
}

/**
 * Status for a single MCP server connection attempt.
 */
export interface MCPServerStatus {
  /** Server name from config. */
  name: string;
  /** Connection state. */
  status: "connecting" | "connected" | "error";
  /** Tool names provided by this server (populated on success). */
  tools: Array<{ name: string; description: string }>;
  /** Error message if connection failed. */
  error?: string;
}

/**
 * Overall result returned by {@link MCPManager.initialize}.
 */
export interface MCPInitResult {
  /** Per-server connection statuses. */
  servers: MCPServerStatus[];
  /** JSON parse error, if the config string is invalid. */
  configError?: string;
}

/**
 * Singleton manager for MCP server connections.
 * Handles lifecycle (connect/disconnect) and tool registration.
 */
export class MCPManager {
  private static instance: MCPManager;
  private clients: Map<string, Client> = new Map();
  private registeredToolIds: Set<string> = new Set();
  private isInitialized = false;
  /** Latest per-server connection statuses. */
  private serverStatuses: MCPServerStatus[] = [];

  private constructor() {}

  /** Get the singleton MCPManager instance. */
  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * Returns the last known per-server statuses recorded during the most recent
   * {@link initialize} call.
   */
  getServerStatuses(): MCPServerStatus[] {
    return this.serverStatuses;
  }

  /**
   * Initialize MCP connections from a JSON config string.
   * Disconnects any existing connections, then connects to configured servers
   * and registers their tools in the ToolRegistry.
   *
   * @param mcpServersConfig - JSON string with MCP server configuration.
   * @returns Detailed result with per-server status (and config parse error if any).
   */
  async initialize(mcpServersConfig: string): Promise<MCPInitResult> {
    // Disconnect and clean up existing connections
    await this.disconnect();
    this.serverStatuses = [];

    if (!mcpServersConfig || !mcpServersConfig.trim()) {
      logInfo("[MCPManager] No MCP servers configured.");
      return { servers: [] };
    }

    let config: MCPServersConfig;
    try {
      config = JSON.parse(mcpServersConfig);
    } catch (e) {
      const configError = e instanceof Error ? e.message : String(e);
      logError("[MCPManager] Invalid MCP servers config JSON:", e);
      return { servers: [], configError };
    }

    const registry = ToolRegistry.getInstance();
    const serverNames = Object.keys(config);

    if (serverNames.length === 0) {
      logInfo("[MCPManager] MCP config is empty, no servers to connect.");
      return { servers: [] };
    }

    logInfo(`[MCPManager] Connecting to ${serverNames.length} MCP server(s): ${serverNames.join(", ")}`);

    // Build initial "connecting" statuses
    const statuses: MCPServerStatus[] = serverNames.map((name) => ({
      name,
      status: "connecting",
      tools: [],
    }));
    this.serverStatuses = statuses;

    // Connect to all servers in parallel
    await Promise.allSettled(
      serverNames.map(async (serverName, idx) => {
        const serverConfig = config[serverName];
        try {
          const client = await this.connectToServer(serverName, serverConfig);
          this.clients.set(serverName, client);

          // List tools from this server and register them
          const { tools: mcpTools } = await client.listTools();
          logInfo(`[MCPManager] Server "${serverName}" provides ${mcpTools.length} tool(s).`);

          const registeredToolInfos: Array<{ name: string; description: string }> = [];

          for (const mcpTool of mcpTools) {
            const toolId = `mcp_${serverName}_${mcpTool.name}`;

            try {
              const schema = buildZodSchema(mcpTool.inputSchema as Record<string, unknown>);
              const displayName = `${serverName}: ${mcpTool.name}`;
              const description = mcpTool.description
                ? `[MCP:${serverName}] ${mcpTool.description}`
                : `[MCP:${serverName}] ${mcpTool.name}`;

              const langchainTool = tool(
                async (args: Record<string, unknown>) => {
                  try {
                    const result = await client.callTool({
                      name: mcpTool.name,
                      arguments: args,
                    });

                    // Format MCP content array as readable text/JSON
                    if (Array.isArray(result.content)) {
                      const parts = result.content.map((item: unknown) => {
                        const typedItem = item as Record<string, unknown>;
                        if (typedItem.type === "text") return typedItem.text as string;
                        return JSON.stringify(typedItem);
                      });
                      return parts.join("\n");
                    }
                    return JSON.stringify(result);
                  } catch (err) {
                    return `Error calling MCP tool ${mcpTool.name}: ${err instanceof Error ? err.message : String(err)}`;
                  }
                },
                {
                  name: toolId,
                  description,
                  schema,
                }
              );

              const toolDef: ToolDefinition = {
                tool: langchainTool,
                metadata: {
                  id: toolId,
                  displayName,
                  description,
                  category: "mcp",
                  isAlwaysEnabled: true,
                },
              };

              registry.register(toolDef);
              this.registeredToolIds.add(toolId);
              registeredToolInfos.push({
                name: mcpTool.name,
                description: mcpTool.description ?? "",
              });
              logInfo(`[MCPManager] Registered MCP tool: ${toolId}`);
            } catch (err) {
              logError(`[MCPManager] Failed to register tool "${mcpTool.name}" from server "${serverName}":`, err);
            }
          }

          statuses[idx] = { name: serverName, status: "connected", tools: registeredToolInfos };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logError(`[MCPManager] Failed to connect to MCP server "${serverName}":`, err);
          statuses[idx] = { name: serverName, status: "error", tools: [], error: errorMsg };
        }
      })
    );

    this.serverStatuses = statuses;
    this.isInitialized = true;
    logInfo(`[MCPManager] Initialization complete. Registered ${this.registeredToolIds.size} MCP tool(s).`);
    return { servers: statuses };
  }

  /**
   * Connect to a single MCP server and return the connected Client.
   *
   * @param name - Human-readable server name for logging.
   * @param config - Server configuration (stdio or remote).
   */
  private async connectToServer(name: string, config: MCPServerConfig): Promise<Client> {
    if (config.url) {
      // Remote server
      logInfo(`[MCPManager] Connecting to remote MCP server "${name}" at ${config.url}`);
      const url = new URL(config.url);
      const requestInit: RequestInit | undefined = config.headers
        ? { headers: config.headers }
        : undefined;

      if (config.type === "sse") {
        // User explicitly requested SSE transport – connect directly without trying StreamableHTTP
        logInfo(`[MCPManager] Using SSE transport for "${name}" (explicit type: sse).`);
        const client = new Client({ name: "obsidian-copilot", version: "1.0.0" });
        const sseTransport = new SSEClientTransport(url, { requestInit });
        await client.connect(sseTransport);
        logInfo(`[MCPManager] Connected to MCP server: ${name}`);
        return client;
      }

      if (config.type === "streamable-http") {
        // User explicitly requested StreamableHTTP – no SSE fallback
        logInfo(`[MCPManager] Using StreamableHTTP transport for "${name}" (explicit type: streamable-http).`);
        const client = new Client({ name: "obsidian-copilot", version: "1.0.0" });
        const transport = new StreamableHTTPClientTransport(url, { requestInit });
        await client.connect(transport);
        logInfo(`[MCPManager] Connected to MCP server: ${name}`);
        return client;
      }

      // Default: try StreamableHTTP first, fall back to legacy SSE.
      // Create a fresh Client for each attempt to avoid partial-init state corruption.
      try {
        const client = new Client({ name: "obsidian-copilot", version: "1.0.0" });
        const transport = new StreamableHTTPClientTransport(url, { requestInit });
        await client.connect(transport);
        logInfo(`[MCPManager] Connected to MCP server: ${name}`);
        return client;
      } catch {
        logWarn(`[MCPManager] StreamableHTTP failed for "${name}", falling back to SSE transport.`);
        // Use a brand-new Client so we start from a clean state
        const client = new Client({ name: "obsidian-copilot", version: "1.0.0" });
        const sseTransport = new SSEClientTransport(url, { requestInit });
        await client.connect(sseTransport);
        logInfo(`[MCPManager] Connected to MCP server: ${name}`);
        return client;
      }
    } else {
      // Local stdio server
      const command = config.command;
      if (!command) {
        throw new Error(`MCP server "${name}" has neither a URL nor a command. Check your configuration.`);
      }
      const client = new Client({ name: "obsidian-copilot", version: "1.0.0" });
      logInfo(`[MCPManager] Spawning stdio MCP server "${name}": ${command} ${(config.args || []).join(" ")}`);
      const transport = new StdioClientTransport({
        command,
        args: config.args ?? [],
        env: config.env,
      });
      await client.connect(transport);
      logInfo(`[MCPManager] Connected to MCP server: ${name}`);
      return client;
    }
  }

  /**
   * Disconnect all active MCP server connections and remove their tools from the registry.
   */
  async disconnect(): Promise<void> {
    // Remove MCP tools from the registry
    const registry = ToolRegistry.getInstance();
    registry.clearMCPTools();
    this.registeredToolIds.clear();

    // Close all client connections
    const disconnectPromises = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        await client.close();
        logInfo(`[MCPManager] Disconnected from MCP server: ${name}`);
      } catch (err) {
        logWarn(`[MCPManager] Error disconnecting from MCP server "${name}":`, err);
      }
    });

    await Promise.allSettled(disconnectPromises);
    this.clients.clear();
    this.isInitialized = false;
  }

  /** Returns true if MCP has been initialized (even with zero servers). */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /** Returns name→Client map for currently connected servers. */
  getConnectedServers(): Map<string, Client> {
    return new Map(this.clients);
  }

  /** Returns the number of connected MCP servers. */
  getServerCount(): number {
    return this.clients.size;
  }

  /** Returns the number of registered MCP tools. */
  getToolCount(): number {
    return this.registeredToolIds.size;
  }
}

// ---------------------------------------------------------------------------
// JSON Schema → Zod conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a JSON Schema object (MCP inputSchema) to a Zod schema suitable for LangChain tools.
 * Falls back to a passthrough record for unsupported or missing schemas.
 *
 * @param inputSchema - The JSON Schema from an MCP tool definition.
 */
function buildZodSchema(inputSchema: Record<string, unknown> | undefined): z.ZodType {
  if (!inputSchema || typeof inputSchema !== "object" || !inputSchema.properties) {
    // No schema defined or no properties - accept anything
    return z.object({}).passthrough();
  }

  const properties = inputSchema.properties as Record<string, unknown>;
  const required: string[] = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];

  const shape: Record<string, z.ZodType> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    let fieldSchema = jsonSchemaToZod(propSchema as Record<string, unknown>);
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional() as z.ZodType;
    }
    shape[key] = fieldSchema;
  }

  return z.object(shape).passthrough();
}

/**
 * Recursively convert a single JSON Schema node to a Zod type.
 *
 * @param schema - A JSON Schema property definition.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  if (!schema || typeof schema !== "object") return z.unknown();

  const description = typeof schema.description === "string" ? schema.description : "";

  // Handle anyOf / oneOf → union
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[];
    if (variants.length === 1) return jsonSchemaToZod(variants[0]);
    const [first, second, ...rest] = variants.map(jsonSchemaToZod);
    return z.union([first, second, ...rest] as [z.ZodType, z.ZodType, ...z.ZodType[]]).describe(description);
  }

  switch (schema.type as string | undefined) {
    case "string":
      return z.string().describe(description);
    case "number":
      return z.number().describe(description);
    case "integer":
      return z.number().int().describe(description);
    case "boolean":
      return z.boolean().describe(description);
    case "null":
      return z.null().describe(description);
    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      const itemSchema = items ? jsonSchemaToZod(items) : z.unknown();
      return z.array(itemSchema).describe(description);
    }
    case "object": {
      const properties = schema.properties as Record<string, unknown> | undefined;
      if (properties) {
        const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];
        const shape: Record<string, z.ZodType> = {};
        for (const [k, v] of Object.entries(properties)) {
          let field = jsonSchemaToZod(v as Record<string, unknown>);
          if (!required.includes(k)) field = field.optional() as z.ZodType;
          shape[k] = field;
        }
        return z.object(shape).passthrough().describe(description);
      }
      return z.record(z.string(), z.unknown()).describe(description);
    }
    default:
      // Unknown or missing type - accept anything
      return z.unknown().describe(description);
  }
}

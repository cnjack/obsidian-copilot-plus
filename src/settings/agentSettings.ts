/**
 * AgentSettings - Unified Settings Schema
 *
 * This file defines the new nested settings structure that replaces the flat
 * CopilotSettings interface. Settings are organized into logical groups:
 * - providers: API keys and endpoint configurations
 * - models: Default and fallback model selections
 * - retrieval: Vector search and indexing configuration
 * - tools: Tool enablement and permissions
 * - contextBehavior: Context inclusion behavior settings
 * - conversation: Chat history and conversation management
 */

import { ChainType } from "@/chainFactory";
import { CustomModel, ProjectConfig } from "@/aiParams";
import { SortStrategy } from "@/utils/recentUsageManager";
import { PromptSortStrategy, ReasoningEffort, Verbosity } from "@/types";
import {
  DEFAULT_OPEN_AREA,
  SEND_SHORTCUT,
  VAULT_VECTOR_STORE_STRATEGY,
} from "@/constants";
import { type CopilotSettings } from "./model";

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Configuration for a single API provider
 */
export interface ProviderConfig {
  apiKey: string;
  endpoint?: string; // Optional custom endpoint
  enabled?: boolean; // Whether this provider is active
}

/**
 * All API provider configurations keyed by provider name
 */
export interface Providers {
  // LLM Providers
  openai?: ProviderConfig;
  anthropic?: ProviderConfig;
  google?: ProviderConfig;
  azureOpenai?: ProviderConfig;
  groq?: ProviderConfig;
  openrouter?: ProviderConfig;
  xai?: ProviderConfig;
  mistral?: ProviderConfig;
  deepseek?: ProviderConfig;
  cohere?: ProviderConfig;
  siliconflow?: ProviderConfig;
  amazonBedrock?: ProviderConfig;
  githubCopilot?: ProviderConfig;
  ollama?: ProviderConfig;
  lmStudio?: ProviderConfig;
  openaiFormat?: ProviderConfig; // Generic OpenAI-compatible provider

  // Embedding Providers
  embeddingOpenai?: ProviderConfig;
  embeddingCohere?: ProviderConfig;
  embeddingGoogle?: ProviderConfig;
  embeddingAzureOpenai?: ProviderConfig;
  embeddingOllama?: ProviderConfig;
  embeddingLmStudio?: ProviderConfig;
  embeddingOpenaiFormat?: ProviderConfig;

  // Service Providers
  brevilabs?: ProviderConfig; // Copilot Plus services
  firecrawl?: ProviderConfig; // Web search
  perplexity?: ProviderConfig; // Web search via Sonar
  supadata?: ProviderConfig; // YouTube transcripts
  miyo?: ProviderConfig; // Self-host mode backend
}

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Model selection and behavior settings
 */
export interface Models {
  defaultChatModel: string; // e.g., "gpt-4|openai"
  fallbackModel?: string;
  embeddingModel: string;

  // Generation parameters
  temperature: number;
  maxTokens: number;
  contextTurns: number;

  // Reasoning-specific settings
  reasoningEffort: ReasoningEffort;
  verbosity: Verbosity;

  // Streaming
  stream: boolean;

  // Custom models
  activeModels: CustomModel[];
  activeEmbeddingModels: CustomModel[];
}

// ============================================================================
// Retrieval Configuration
// ============================================================================

/**
 * Retrieval mode options
 */
export type RetrievalMode = "auto" | "lexical" | "semantic";

/**
 * Vector search and indexing settings
 */
export interface Retrieval {
  mode: RetrievalMode;

  // Semantic search
  enableSemanticSearch: boolean;
  embeddingRequestsPerMin: number;
  embeddingBatchSize: number;

  // Lexical search
  enableLexicalBoosts: boolean;
  lexicalSearchRamLimit: number;

  // Index settings
  indexVaultStrategy: VAULT_VECTOR_STORE_STRATEGY;
  numPartitions: number;
  chunkSize?: number;
  chunkOverlap?: number;

  // QA settings
  exclusions?: string; // Comma-separated glob patterns
  inclusions?: string; // Comma-separated glob patterns
  maxSourceChunks: number;
  enableIndexSync: boolean;
  disableIndexOnMobile: boolean;

  // Self-host mode
  enableSelfHostMode: boolean;
  enableMiyo: boolean;
  selfHostUrl?: string;
  selfHostApiKey?: string;
  selfHostSearchProvider: "firecrawl" | "perplexity";
}

// ============================================================================
// Tools Configuration
// ============================================================================

/**
 * Tool execution and permission settings
 */
export interface Tools {
  // Autonomous agent
  autonomousAgentMaxIterations: number;
  enabledToolIds: string[];

  // Tool permissions and budgets
  maxToolBudget?: Record<string, number>; // Max invocations per tool

  // Custom commands
  customCommands?: ProjectConfig[]; // Legacy: projectList

  // Feature flags
  showSuggestedPrompts: boolean;
  showRelevantNotes: boolean;
}

// ============================================================================
// Context Behavior Configuration
// ============================================================================

/**
 * Settings controlling how context is automatically included
 */
export interface ContextBehavior {
  // Auto-include settings
  autoAddActiveContentToContext: boolean;
  autoIncludeTextSelection: boolean;
  autoAddSelectionToContext: boolean;

  // Note context
  chatNoteContextPath: string;
  chatNoteContextTags: string[];

  // Inline features
  enableInlineCitations: boolean;
  passMarkdownImages: boolean;

  // Custom prompt templating
  enableCustomPromptTemplating: boolean;
  customPromptsFolder: string;
  userSystemPromptsFolder: string;
  defaultSystemPromptTitle: string;

  // Memory
  memoryFolderName: string;
  enableRecentConversations: boolean;
  maxRecentConversations: number;
  enableSavedMemory: boolean;
}

// ============================================================================
// Conversation Configuration
// ============================================================================

/**
 * Chat history and conversation management settings
 */
export interface Conversation {
  // Save locations
  defaultSaveFolder: string;
  defaultConversationTag: string;
  defaultConversationNoteName: string;
  convertedDocOutputFolder: string;

  // Auto-save
  autosaveChat: boolean;
  generateAIChatTitleOnSave: boolean;

  // UI preferences
  defaultOpenArea: DEFAULT_OPEN_AREA;
  defaultSendShortcut: SEND_SHORTCUT;
  diffViewMode: "side-by-side" | "split";
  autoAcceptEdits: boolean;

  // Sort strategies
  promptSortStrategy: PromptSortStrategy;
  chatHistorySortStrategy: SortStrategy;
  projectListSortStrategy: SortStrategy;

  // Quick command preferences
  quickCommandModelKey?: string;
  quickCommandIncludeNoteContext: boolean;

  // Projects (legacy support)
  projectList: ProjectConfig[];
}

// ============================================================================
// Debug and Advanced Settings
// ============================================================================

/**
 * Debug, logging, and advanced configuration
 */
export interface AdvancedSettings {
  debug: boolean;
  enableEncryption: boolean;
  lastDismissedVersion: string | null;

  // User identification (for analytics)
  userId: string;

  // Legacy/deprecated fields for migration
  _legacy?: Record<string, unknown>;
}

// ============================================================================
// Main AgentSettings Interface
// ============================================================================

/**
 * Unified Agent Settings
 *
 * This is the main settings interface that replaces CopilotSettings.
 * All settings are organized into logical nested groups.
 */
export interface AgentSettings {
  providers: Providers;
  models: Models;
  retrieval: Retrieval;
  tools: Tools;
  contextBehavior: ContextBehavior;
  conversation: Conversation;
  advanced: AdvancedSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

/**
 * Default Agent Settings values
 */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  providers: {
    // LLM Provider API keys (all empty by default)
    openai: { apiKey: "" },
    anthropic: { apiKey: "" },
    google: { apiKey: "" },
    azureOpenai: { apiKey: "" },
    groq: { apiKey: "" },
    openrouter: { apiKey: "" },
    xai: { apiKey: "" },
    mistral: { apiKey: "" },
    deepseek: { apiKey: "" },
    cohere: { apiKey: "" },
    siliconflow: { apiKey: "" },
    amazonBedrock: { apiKey: "" },
    githubCopilot: { apiKey: "" },
    ollama: { apiKey: "" },
    lmStudio: { apiKey: "" },
    openaiFormat: { apiKey: "" },

    // Embedding providers
    embeddingOpenai: { apiKey: "" },
    embeddingCohere: { apiKey: "" },
    embeddingGoogle: { apiKey: "" },
    embeddingAzureOpenai: { apiKey: "" },
    embeddingOllama: { apiKey: "" },
    embeddingLmStudio: { apiKey: "" },
    embeddingOpenaiFormat: { apiKey: "" },

    // Service providers
    brevilabs: { apiKey: "" },
    firecrawl: { apiKey: "" },
    perplexity: { apiKey: "" },
    supadata: { apiKey: "" },
    miyo: { apiKey: "" },
  },

  models: {
    defaultChatModel: "gemini-2.5-flash|openrouterai",
    fallbackModel: undefined,
    embeddingModel: "text-embedding-3-small|openai",
    temperature: 0.1,
    maxTokens: 6000,
    contextTurns: 15,
    reasoningEffort: ReasoningEffort.LOW,
    verbosity: Verbosity.MEDIUM,
    stream: true,
    activeModels: [],
    activeEmbeddingModels: [],
  },

  retrieval: {
    mode: "auto",
    enableSemanticSearch: false,
    embeddingRequestsPerMin: 60,
    embeddingBatchSize: 16,
    enableLexicalBoosts: true,
    lexicalSearchRamLimit: 100,
    indexVaultStrategy: VAULT_VECTOR_STORE_STRATEGY.ON_MODE_SWITCH,
    numPartitions: 1,
    chunkSize: 6000,
    chunkOverlap: undefined,
    exclusions: "copilot",
    inclusions: "",
    maxSourceChunks: 30,
    enableIndexSync: true,
    disableIndexOnMobile: true,
    enableSelfHostMode: false,
    enableMiyo: false,
    selfHostUrl: "",
    selfHostApiKey: "",
    selfHostSearchProvider: "firecrawl",
  },

  tools: {
    autonomousAgentMaxIterations: 4,
    enabledToolIds: [
      "localSearch",
      "readNote",
      "pomodoro",
      "writeToFile",
      "replaceInFile",
      "updateMemory",
    ],
    showSuggestedPrompts: true,
    showRelevantNotes: true,
  },

  contextBehavior: {
    autoAddActiveContentToContext: true,
    autoIncludeTextSelection: false,
    autoAddSelectionToContext: false,
    chatNoteContextPath: "",
    chatNoteContextTags: [],
    enableInlineCitations: true,
    passMarkdownImages: true,
    enableCustomPromptTemplating: true,
    customPromptsFolder: "copilot/copilot-custom-prompts",
    userSystemPromptsFolder: "copilot/system-prompts",
    defaultSystemPromptTitle: "",
    memoryFolderName: "copilot/memory",
    enableRecentConversations: true,
    maxRecentConversations: 30,
    enableSavedMemory: true,
  },

  conversation: {
    defaultSaveFolder: "copilot/copilot-conversations",
    defaultConversationTag: "copilot-conversation",
    defaultConversationNoteName: "{$topic}@{$date}_{$time}",
    convertedDocOutputFolder: "",
    autosaveChat: true,
    generateAIChatTitleOnSave: true,
    defaultOpenArea: DEFAULT_OPEN_AREA.VIEW,
    defaultSendShortcut: SEND_SHORTCUT.ENTER,
    diffViewMode: "split",
    autoAcceptEdits: false,
    promptSortStrategy: PromptSortStrategy.TIMESTAMP,
    chatHistorySortStrategy: "recent",
    projectListSortStrategy: "recent",
    quickCommandModelKey: undefined,
    quickCommandIncludeNoteContext: true,
    projectList: [],
  },

  advanced: {
    debug: false,
    enableEncryption: false,
    lastDismissedVersion: null,
    userId: "", // Generated at runtime
  },
};

// ============================================================================
// Migration Utilities
// ============================================================================

/**
 * Type guard to check if a value is a valid AgentSettings
 */
export function isValidAgentSettings(value: unknown): value is AgentSettings {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    "providers" in obj &&
    "models" in obj &&
    "retrieval" in obj &&
    "tools" in obj &&
    "contextBehavior" in obj &&
    "conversation" in obj &&
    "advanced" in obj
  );
}

/**
 * Migrate from legacy CopilotSettings to new AgentSettings
 *
 * This function converts the flat CopilotSettings structure to the new
 * nested AgentSettings structure. It handles field renaming and provides
 * default values for new fields.
 *
 * @param legacySettings - The old flat settings structure
 * @returns The new nested AgentSettings structure
 */
export function migrateToAgentSettings(legacySettings: CopilotSettings): AgentSettings {
  // Generate userId if not present
  const userId = legacySettings.userId || `migrated-${Date.now()}`;

  return {
    providers: {
      // LLM Provider API keys
      openai: { apiKey: legacySettings.openAIApiKey || "" },
      anthropic: { apiKey: legacySettings.anthropicApiKey || "" },
      google: { apiKey: legacySettings.googleApiKey || "" },
      azureOpenai: {
        apiKey: legacySettings.azureOpenAIApiKey || "",
        endpoint: legacySettings.openAIProxyBaseUrl || "",
      },
      groq: { apiKey: legacySettings.groqApiKey || "" },
      openrouter: { apiKey: legacySettings.openRouterAiApiKey || "" },
      xai: { apiKey: legacySettings.xaiApiKey || "" },
      mistral: { apiKey: legacySettings.mistralApiKey || "" },
      deepseek: { apiKey: legacySettings.deepseekApiKey || "" },
      cohere: { apiKey: legacySettings.cohereApiKey || "" },
      siliconflow: { apiKey: legacySettings.siliconflowApiKey || "" },
      amazonBedrock: { apiKey: legacySettings.amazonBedrockApiKey || "" },
      githubCopilot: { apiKey: legacySettings.githubCopilotToken || "" },
      ollama: { apiKey: "" }, // No API key needed for local Ollama
      lmStudio: { apiKey: "" }, // No API key needed for local LM Studio
      openaiFormat: {
        apiKey: "",
        endpoint: legacySettings.openAIProxyBaseUrl || "",
      },

      // Embedding providers
      embeddingOpenai: { apiKey: legacySettings.openAIApiKey || "" },
      embeddingCohere: { apiKey: legacySettings.cohereApiKey || "" },
      embeddingGoogle: { apiKey: legacySettings.googleApiKey || "" },
      embeddingAzureOpenai: { apiKey: legacySettings.azureOpenAIApiKey || "" },
      embeddingOllama: { apiKey: "" },
      embeddingLmStudio: { apiKey: "" },
      embeddingOpenaiFormat: {
        apiKey: "",
        endpoint: legacySettings.openAIEmbeddingProxyBaseUrl || "",
      },

      // Service providers
      brevilabs: { apiKey: legacySettings.plusLicenseKey || "" }, // Migrate Plus key
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      firecrawl: { apiKey: (legacySettings as any).firecrawlApiKey || "" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      perplexity: { apiKey: (legacySettings as any).perplexityApiKey || "" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supadata: { apiKey: (legacySettings as any).supadataApiKey || "" },
      miyo: {
        apiKey: legacySettings.selfHostApiKey || "",
        endpoint: legacySettings.selfHostUrl || "",
      },
    },

    models: {
      defaultChatModel: legacySettings.defaultModelKey,
      fallbackModel: undefined, // No direct mapping
      embeddingModel: legacySettings.embeddingModelKey,
      temperature: legacySettings.temperature,
      maxTokens: legacySettings.maxTokens,
      contextTurns: legacySettings.contextTurns,
      reasoningEffort: legacySettings.reasoningEffort as ReasoningEffort,
      verbosity: legacySettings.verbosity as Verbosity,
      stream: legacySettings.stream,
      activeModels: legacySettings.activeModels,
      activeEmbeddingModels: legacySettings.activeEmbeddingModels,
    },

    retrieval: {
      mode: legacySettings.enableSemanticSearchV3 ? "semantic" : "auto",
      enableSemanticSearch: legacySettings.enableSemanticSearchV3,
      embeddingRequestsPerMin: legacySettings.embeddingRequestsPerMin,
      embeddingBatchSize: legacySettings.embeddingBatchSize,
      enableLexicalBoosts: legacySettings.enableLexicalBoosts,
      lexicalSearchRamLimit: legacySettings.lexicalSearchRamLimit,
      indexVaultStrategy: legacySettings.indexVaultToVectorStore as VAULT_VECTOR_STORE_STRATEGY,
      numPartitions: legacySettings.numPartitions,
      chunkSize: 6000, // Default from constants
      chunkOverlap: undefined,
      exclusions: legacySettings.qaExclusions,
      inclusions: legacySettings.qaInclusions,
      maxSourceChunks: legacySettings.maxSourceChunks,
      enableIndexSync: legacySettings.enableIndexSync,
      disableIndexOnMobile: legacySettings.disableIndexOnMobile,
      enableSelfHostMode: legacySettings.enableSelfHostMode,
      enableMiyo: legacySettings.enableMiyo,
      selfHostUrl: legacySettings.selfHostUrl,
      selfHostApiKey: legacySettings.selfHostApiKey,
      selfHostSearchProvider: legacySettings.selfHostSearchProvider,
    },

    tools: {
      autonomousAgentMaxIterations: legacySettings.autonomousAgentMaxIterations,
      enabledToolIds: legacySettings.autonomousAgentEnabledToolIds,
      showSuggestedPrompts: legacySettings.showSuggestedPrompts,
      showRelevantNotes: legacySettings.showRelevantNotes,
      customCommands: legacySettings.projectList,
    },

    contextBehavior: {
      autoAddActiveContentToContext: legacySettings.autoAddActiveContentToContext,
      autoIncludeTextSelection: legacySettings.autoIncludeTextSelection || false,
      autoAddSelectionToContext: legacySettings.autoAddSelectionToContext,
      chatNoteContextPath: legacySettings.chatNoteContextPath,
      chatNoteContextTags: legacySettings.chatNoteContextTags,
      enableInlineCitations: legacySettings.enableInlineCitations,
      passMarkdownImages: legacySettings.passMarkdownImages,
      enableCustomPromptTemplating: legacySettings.enableCustomPromptTemplating,
      customPromptsFolder: legacySettings.customPromptsFolder,
      userSystemPromptsFolder: legacySettings.userSystemPromptsFolder,
      defaultSystemPromptTitle: legacySettings.defaultSystemPromptTitle,
      memoryFolderName: legacySettings.memoryFolderName,
      enableRecentConversations: legacySettings.enableRecentConversations,
      maxRecentConversations: legacySettings.maxRecentConversations,
      enableSavedMemory: legacySettings.enableSavedMemory,
    },

    conversation: {
      defaultSaveFolder: legacySettings.defaultSaveFolder,
      defaultConversationTag: legacySettings.defaultConversationTag,
      defaultConversationNoteName: legacySettings.defaultConversationNoteName,
      convertedDocOutputFolder: legacySettings.convertedDocOutputFolder,
      autosaveChat: legacySettings.autosaveChat,
      generateAIChatTitleOnSave: legacySettings.generateAIChatTitleOnSave,
      defaultOpenArea: legacySettings.defaultOpenArea,
      defaultSendShortcut: legacySettings.defaultSendShortcut,
      diffViewMode: legacySettings.diffViewMode,
      autoAcceptEdits: legacySettings.autoAcceptEdits,
      promptSortStrategy: legacySettings.promptSortStrategy as PromptSortStrategy,
      chatHistorySortStrategy: legacySettings.chatHistorySortStrategy,
      projectListSortStrategy: legacySettings.projectListSortStrategy,
      quickCommandModelKey: legacySettings.quickCommandModelKey,
      quickCommandIncludeNoteContext: legacySettings.quickCommandIncludeNoteContext,
      projectList: legacySettings.projectList,
    },

    advanced: {
      debug: legacySettings.debug,
      enableEncryption: legacySettings.enableEncryption,
      lastDismissedVersion: legacySettings.lastDismissedVersion,
      userId,
      // Store deprecated fields for potential migration needs
      _legacy: {
        plusLicenseKey: legacySettings.plusLicenseKey,
        isPlusUser: legacySettings.isPlusUser,
        huggingfaceApiKey: legacySettings.huggingfaceApiKey,
        userSystemPrompt: legacySettings.userSystemPrompt, // deprecated
        inlineEditCommands: legacySettings.inlineEditCommands, // deprecated
        mcpServersConfig: legacySettings.mcpServersConfig, // preserve for round-trip
      },
    },
  };
}

/**
 * Migrate from new AgentSettings back to legacy CopilotSettings
 *
 * This is provided for backwards compatibility during the transition period.
 * Note: Some fields may not have direct mappings.
 *
 * @param newSettings - The new nested settings structure
 * @returns The legacy flat CopilotSettings structure
 */
export function migrateFromAgentSettings(newSettings: AgentSettings): CopilotSettings {
  return {
    userId: newSettings.advanced.userId,
    // Note: isPlusUser and plusLicenseKey are deprecated, but stored in _legacy
    isPlusUser: undefined,
    plusLicenseKey: newSettings.advanced._legacy?.plusLicenseKey as string || "",
    openAIApiKey: newSettings.providers.openai?.apiKey || "",
    openAIOrgId: "", // No direct mapping
    huggingfaceApiKey: newSettings.advanced._legacy?.huggingfaceApiKey as string || "",
    cohereApiKey: newSettings.providers.cohere?.apiKey || "",
    anthropicApiKey: newSettings.providers.anthropic?.apiKey || "",
    azureOpenAIApiKey: newSettings.providers.azureOpenai?.apiKey || "",
    azureOpenAIApiInstanceName: "", // No direct mapping
    azureOpenAIApiDeploymentName: "", // No direct mapping
    azureOpenAIApiVersion: "", // No direct mapping
    azureOpenAIApiEmbeddingDeploymentName: "", // No direct mapping
    googleApiKey: newSettings.providers.google?.apiKey || "",
    openRouterAiApiKey: newSettings.providers.openrouter?.apiKey || "",
    xaiApiKey: newSettings.providers.xai?.apiKey || "",
    mistralApiKey: newSettings.providers.mistral?.apiKey || "",
    deepseekApiKey: newSettings.providers.deepseek?.apiKey || "",
    amazonBedrockApiKey: newSettings.providers.amazonBedrock?.apiKey || "",
    amazonBedrockRegion: "", // No direct mapping
    siliconflowApiKey: newSettings.providers.siliconflow?.apiKey || "",
    githubCopilotAccessToken: "", // No direct mapping
    githubCopilotToken: newSettings.providers.githubCopilot?.apiKey || "",
    githubCopilotTokenExpiresAt: 0, // No direct mapping
    defaultChainType: ChainType.LLM_CHAIN, // Default value
    defaultModelKey: newSettings.models.defaultChatModel,
    embeddingModelKey: newSettings.models.embeddingModel,
    temperature: newSettings.models.temperature,
    maxTokens: newSettings.models.maxTokens,
    contextTurns: newSettings.models.contextTurns,
    userSystemPrompt: newSettings.advanced._legacy?.userSystemPrompt as string || "",
    openAIProxyBaseUrl: newSettings.providers.openaiFormat?.endpoint || "",
    openAIEmbeddingProxyBaseUrl: newSettings.providers.embeddingOpenaiFormat?.endpoint || "",
    stream: newSettings.models.stream,
    defaultSaveFolder: newSettings.conversation.defaultSaveFolder,
    defaultConversationTag: newSettings.conversation.defaultConversationTag,
    autosaveChat: newSettings.conversation.autosaveChat,
    generateAIChatTitleOnSave: newSettings.conversation.generateAIChatTitleOnSave,
    autoAddActiveContentToContext: newSettings.contextBehavior.autoAddActiveContentToContext,
    customPromptsFolder: newSettings.contextBehavior.customPromptsFolder,
    indexVaultToVectorStore: newSettings.retrieval.indexVaultStrategy,
    chatNoteContextPath: newSettings.contextBehavior.chatNoteContextPath,
    chatNoteContextTags: newSettings.contextBehavior.chatNoteContextTags,
    enableIndexSync: newSettings.retrieval.enableIndexSync,
    debug: newSettings.advanced.debug,
    enableEncryption: newSettings.advanced.enableEncryption,
    maxSourceChunks: newSettings.retrieval.maxSourceChunks,
    enableInlineCitations: newSettings.contextBehavior.enableInlineCitations,
    qaExclusions: newSettings.retrieval.exclusions || "",
    qaInclusions: newSettings.retrieval.inclusions || "",
    groqApiKey: newSettings.providers.groq?.apiKey || "",
    activeModels: newSettings.models.activeModels,
    activeEmbeddingModels: newSettings.models.activeEmbeddingModels,
    promptUsageTimestamps: {}, // No direct mapping
    promptSortStrategy: newSettings.conversation.promptSortStrategy,
    chatHistorySortStrategy: newSettings.conversation.chatHistorySortStrategy,
    projectListSortStrategy: newSettings.conversation.projectListSortStrategy,
    embeddingRequestsPerMin: newSettings.retrieval.embeddingRequestsPerMin,
    embeddingBatchSize: newSettings.retrieval.embeddingBatchSize,
    defaultOpenArea: newSettings.conversation.defaultOpenArea,
    defaultSendShortcut: newSettings.conversation.defaultSendShortcut,
    disableIndexOnMobile: newSettings.retrieval.disableIndexOnMobile,
    showSuggestedPrompts: newSettings.tools.showSuggestedPrompts,
    showRelevantNotes: newSettings.tools.showRelevantNotes,
    numPartitions: newSettings.retrieval.numPartitions,
    defaultConversationNoteName: newSettings.conversation.defaultConversationNoteName,
    inlineEditCommands: newSettings.advanced._legacy?.inlineEditCommands as any || [],
    projectList: newSettings.conversation.projectList,
    passMarkdownImages: newSettings.contextBehavior.passMarkdownImages,
    enableCustomPromptTemplating: newSettings.contextBehavior.enableCustomPromptTemplating,
    enableSemanticSearchV3: newSettings.retrieval.enableSemanticSearch,
    enableSelfHostMode: newSettings.retrieval.enableSelfHostMode,
    enableMiyo: newSettings.retrieval.enableMiyo,
    selfHostModeValidatedAt: null, // No direct mapping
    selfHostValidationCount: 0, // No direct mapping
    selfHostUrl: newSettings.retrieval.selfHostUrl || "",
    selfHostApiKey: newSettings.retrieval.selfHostApiKey || "",
    selfHostSearchProvider: newSettings.retrieval.selfHostSearchProvider,
    // Note: firecrawlApiKey, perplexityApiKey, supadataApiKey removed from CopilotSettings,
    // now stored in providers.firecrawl/perplexity/supadata.apiKey in AgentSettings.
    enableLexicalBoosts: newSettings.retrieval.enableLexicalBoosts,
    lexicalSearchRamLimit: newSettings.retrieval.lexicalSearchRamLimit,
    suggestedDefaultCommands: false, // No direct mapping
    autonomousAgentMaxIterations: newSettings.tools.autonomousAgentMaxIterations,
    autonomousAgentEnabledToolIds: newSettings.tools.enabledToolIds,
    reasoningEffort: newSettings.models.reasoningEffort as "minimal" | "low" | "medium" | "high",
    verbosity: newSettings.models.verbosity as "low" | "medium" | "high",
    memoryFolderName: newSettings.contextBehavior.memoryFolderName,
    enableRecentConversations: newSettings.contextBehavior.enableRecentConversations,
    maxRecentConversations: newSettings.contextBehavior.maxRecentConversations,
    enableSavedMemory: newSettings.contextBehavior.enableSavedMemory,
    quickCommandModelKey: newSettings.conversation.quickCommandModelKey,
    quickCommandIncludeNoteContext: newSettings.conversation.quickCommandIncludeNoteContext,
    autoIncludeTextSelection: newSettings.contextBehavior.autoIncludeTextSelection,
    autoAddSelectionToContext: newSettings.contextBehavior.autoAddSelectionToContext,
    autoAcceptEdits: newSettings.conversation.autoAcceptEdits,
    diffViewMode: newSettings.conversation.diffViewMode,
    userSystemPromptsFolder: newSettings.contextBehavior.userSystemPromptsFolder,
    defaultSystemPromptTitle: newSettings.contextBehavior.defaultSystemPromptTitle,
    autoCompactThreshold: 128000, // Default value, no direct mapping
    convertedDocOutputFolder: newSettings.conversation.convertedDocOutputFolder,
    lastDismissedVersion: newSettings.advanced.lastDismissedVersion,
    mcpServersConfig: newSettings.advanced._legacy?.mcpServersConfig as string || "",
  };
}

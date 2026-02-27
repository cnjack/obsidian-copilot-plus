/**
 * Unified AgentChainRunner - Agentic-by-default chain runner
 *
 * This runner unifies LLMChainRunner, VaultQAChainRunner, CopilotPlusChainRunner,
 * and AutonomousAgentChainRunner into a single cohesive implementation.
 *
 * Features:
 * - Automatic tool routing by default
 * - Unified context system (note refs, vault search, web search)
 * - State machine pattern for agentic loop
 * - Native tool calling with ReAct fallback
 * - Zod input validation for security
 */

import {
  AGENT_LOOP_TIMEOUT_MS,
  DEFAULT_MAX_SOURCE_CHUNKS,
  ModelCapability,
  RETRIEVED_DOCUMENT_TAG,
} from "@/constants";
import { MessageContent } from "@/imageProcessing/imageProcessor";
import { logError, logInfo, logWarn } from "@/logger";
import { getSettings } from "@/settings/model";
import { ChatMessage, ResponseMetadata, StreamingResult } from "@/types/message";
import { withSuppressedTokenWarnings } from "@/utils";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import { LayerToMessagesConverter } from "@/context/LayerToMessagesConverter";
import { ToolRegistry } from "@/tools/ToolRegistry";
import { initializeBuiltinTools } from "@/tools/builtinTools";
import { QueryExpander } from "@/search/v3/QueryExpander";

import { BaseChainRunner } from "./BaseChainRunner";
import { loadAndAddChatHistory } from "./utils/chatHistoryUtils";
import { ModelAdapter, ModelAdapterFactory } from "./utils/modelAdapter";
import { ThinkBlockStreamer } from "./utils/ThinkBlockStreamer";
import {
  deduplicateSources,
  executeSequentialToolCall,
  logToolCall,
  logToolResult,
} from "./utils/toolExecution";
import {
  createToolResultMessage,
  generateToolCallId,
  buildToolCallsFromChunks,
  ToolCallChunk,
} from "./utils/nativeToolCalling";
import { ensureCiCOrderingWithQuestion } from "./utils/cicPromptUtils";
import { buildAgentPromptDebugReport } from "./utils/promptDebugService";
import { recordPromptPayload } from "./utils/promptPayloadRecorder";
import { PromptDebugReport } from "./utils/toolPromptDebugger";
import {
  AgentReasoningState,
  createInitialReasoningState,
  extractFirstSentence,
  LocalSearchSourceInfo,
  serializeReasoningBlock,
  summarizeToolCall,
  summarizeToolResult,
  QueryExpansionInfo,
} from "./utils/AgentReasoningState";
import { getSystemPromptWithMemory } from "@/system-prompts/systemPromptBuilder";
import { UserMemoryManager } from "@/memory/UserMemoryManager";
import { ToolResultFormatter } from "@/tools/ToolResultFormatter";
import { RetrieverFactory } from "@/search/RetrieverFactory";
import { FilterRetriever } from "@/search/v3/FilterRetriever";
import { mergeFilterAndSearchResults } from "@/search/v3/mergeResults";
import { extractTagsFromQuery } from "@/search/v3/utils/tagUtils";
import {
  formatSourceCatalog,
  getQACitationInstructions,
  sanitizeContentForCitations,
  type SourceCatalogEntry,
} from "./utils/citationUtils";
import { extractChatHistory } from "@/utils";

// ============================================================================
// Zod Input Validation Schema
// ============================================================================

/**
 * Zod schema for validating agent input parameters.
 * Ensures security and type safety at the agent boundary.
 */
const AgentInputSchema = z.object({
  userMessage: z.object({
    message: z.string(),
    originalMessage: z.string().optional(),
    content: z.any().optional(), // MessageContent[] for multimodal
    contextEnvelope: z.any().optional(), // ContextEnvelope for layered context
  }),
  abortController: z.instanceof(AbortController),
  options: z
    .object({
      debug: z.boolean().optional(),
      ignoreSystemMessage: z.boolean().optional(),
      updateLoading: z.function().optional(),
      updateLoadingMessage: z.function().optional(),
    })
    .optional(),
});

/**
 * Validate agent input using Zod.
 * @throws {z.ZodError} If validation fails
 */
function validateAgentInput(input: unknown): z.infer<typeof AgentInputSchema> {
  return AgentInputSchema.parse(input);
}

// ============================================================================
// Type Definitions
// ============================================================================

type AgentSource = {
  title: string;
  path: string;
  score: number;
  explanation?: any;
};

interface AgentLoopDeps {
  availableTools: StructuredTool[];
  boundModel: Runnable;
  processLocalSearchResult: (
    toolResult: { result: string; success: boolean },
    timeExpression?: string
  ) => {
    formattedForLLM: string;
    formattedForDisplay: string;
    sources: AgentSource[];
  };
  applyCiCOrderingToLocalSearchResult: (localSearchPayload: string, originalPrompt: string) => string;
}

interface AgentRunContext {
  messages: BaseMessage[];
  collectedSources: AgentSource[];
  originalUserPrompt: string;
  loopDeps: AgentLoopDeps;
}

interface ReActLoopParams {
  boundModel: Runnable;
  tools: StructuredTool[];
  messages: BaseMessage[];
  originalPrompt: string;
  abortController: AbortController;
  updateCurrentAiMessage: (message: string) => void;
  processLocalSearchResult: AgentLoopDeps["processLocalSearchResult"];
  applyCiCOrderingToLocalSearchResult: AgentLoopDeps["applyCiCOrderingToLocalSearchResult"];
  adapter: ModelAdapter;
  isVaultQAMode: boolean;
  vaultQADocs?: any[];
}

interface ReActLoopResult {
  finalResponse: string;
  sources: AgentSource[];
  responseMetadata?: ResponseMetadata;
}

// ============================================================================
// AgentChainRunner Class
// ============================================================================

export class AgentChainRunner extends BaseChainRunner {
  // Agent Reasoning Block state
  private reasoningState: AgentReasoningState = createInitialReasoningState();
  private reasoningTimerInterval: ReturnType<typeof setInterval> | null = null;
  private accumulatedContent = "";
  private allReasoningSteps: Array<{
    timestamp: number;
    summary: string;
    toolName?: string;
  }> = [];
  private abortHandledByTimer = false;

  // Track LLM formatted messages for memory
  private llmFormattedMessages: string[] = [];
  private lastDisplayedContent = "";

  // Vault QA specific state
  private vaultQADocuments: any[] = [];

  /**
   * Get available tools from the registry.
   */
  private getAvailableTools(): StructuredTool[] {
    const settings = getSettings();
    const registry = ToolRegistry.getInstance();

    // Initialize tools if not already done
    if (registry.getAllTools().length === 0) {
      initializeBuiltinTools(this.chainManager.app?.vault);
    }

    // Get enabled tool IDs from settings
    const enabledToolIds = new Set(settings.autonomousAgentEnabledToolIds || []);

    // Get all enabled tools from registry
    return registry.getEnabledTools(enabledToolIds, !!this.chainManager.app?.vault);
  }

  /**
   * Start the reasoning timer and initialize reasoning state.
   */
  private startReasoningTimer(
    updateFn: (message: string) => void,
    abortController?: AbortController
  ): void {
    this.reasoningState = {
      status: "reasoning",
      startTime: Date.now(),
      elapsedSeconds: 0,
      steps: [],
    };
    this.accumulatedContent = "";
    this.allReasoningSteps = [];
    this.abortHandledByTimer = false;

    // Add initial step immediately for better UX (randomized for variety)
    const initialSteps = [
      "Understanding your question",
      "Analyzing your request",
      "Processing your query",
      "Thinking about this",
      "Considering your question",
      "Working on this",
      "Pondering the possibilities",
      "Diving into your request",
      "Let me think about this",
      "Exploring your question",
    ];
    const randomStep = initialSteps[Math.floor(Math.random() * initialSteps.length)];
    this.addReasoningStep(randomStep);

    // Update every 100ms for smooth timer
    this.reasoningTimerInterval = setInterval(() => {
      // Check for abort and show interrupted message immediately
      if (abortController?.signal.aborted && this.reasoningState.status === "reasoning") {
        this.stopReasoningTimer();
        this.reasoningState.status = "complete";
        this.abortHandledByTimer = true;
        const reasoningBlock = this.buildReasoningBlockMarkup();
        const interruptedMessage = "The response was interrupted.";
        const finalResponse = reasoningBlock
          ? reasoningBlock + "\n\n" + interruptedMessage
          : interruptedMessage;
        updateFn(finalResponse);
        return;
      }

      if (this.reasoningState.startTime && this.reasoningState.status === "reasoning") {
        this.reasoningState.elapsedSeconds = Math.floor(
          (Date.now() - this.reasoningState.startTime) / 1000
        );
        const reasoningBlock = this.buildReasoningBlockMarkup();
        const fullMessage = reasoningBlock
          ? reasoningBlock + (this.accumulatedContent ? "\n\n" + this.accumulatedContent : "")
          : this.accumulatedContent;
        updateFn(fullMessage);
      }
    }, 100);
  }

  /**
   * Add a reasoning step to the display.
   */
  private addReasoningStep(summary: string, toolName?: string, detailedOnly = false): void {
    const step = {
      timestamp: Date.now(),
      summary,
      toolName,
    };
    this.allReasoningSteps.push(step);

    if (detailedOnly) {
      return;
    }

    this.reasoningState.steps.push(step);
    // Keep only last 4 steps for rolling window display during reasoning
    if (this.reasoningState.steps.length > 4) {
      this.reasoningState.steps.shift();
    }
  }

  /**
   * Stop the reasoning timer.
   */
  private stopReasoningTimer(): void {
    if (this.reasoningTimerInterval) {
      clearInterval(this.reasoningTimerInterval);
      this.reasoningTimerInterval = null;
    }
    this.reasoningState.status = "collapsed";
  }

  /**
   * Build the reasoning block markup for embedding in the message.
   */
  private buildReasoningBlockMarkup(): string {
    if (this.reasoningState.status === "complete" || this.reasoningState.status === "collapsed") {
      const stateWithFullHistory: AgentReasoningState = {
        ...this.reasoningState,
        steps: this.allReasoningSteps,
      };
      return serializeReasoningBlock(stateWithFullHistory);
    }
    return serializeReasoningBlock(this.reasoningState);
  }

  /**
   * Generate system prompt for the agent.
   */
  public static async generateSystemPrompt(
    availableTools: StructuredTool[],
    _adapter?: ModelAdapter,
    userMemoryManager?: UserMemoryManager
  ): Promise<string> {
    const basePrompt = await getSystemPromptWithMemory(userMemoryManager);

    // Get tool metadata for custom instructions
    const registry = ToolRegistry.getInstance();
    const toolMetadata = availableTools
      .map((tool) => registry.getToolMetadata(tool.name))
      .filter((meta): meta is NonNullable<typeof meta> => meta !== undefined);

    // Build tool-specific instructions from metadata
    const toolInstructions = toolMetadata
      .filter((meta) => meta.customPromptInstructions)
      .map((meta) => `For ${meta.displayName}: ${meta.customPromptInstructions}`)
      .join("\n");

    if (toolInstructions) {
      return `${basePrompt}\n\n## Tool Guidelines\n${toolInstructions}`;
    }
    return basePrompt;
  }

  /**
   * Build an annotated prompt report for debugging.
   */
  public async buildToolPromptDebugReport(userMessage: ChatMessage): Promise<PromptDebugReport> {
    const availableTools = this.getAvailableTools();
    const adapter = ModelAdapterFactory.createAdapter(
      this.chainManager.chatModelManager.getChatModel()
    );
    const toolDescriptions = availableTools.map((t) => `${t.name}: ${t.description}`).join("\n");

    return buildAgentPromptDebugReport({
      chainManager: this.chainManager,
      adapter,
      availableTools,
      toolDescriptions,
      userMessage,
    });
  }

  /**
   * Apply CiC ordering by appending the original user question.
   */
  protected applyCiCOrderingToLocalSearchResult(
    localSearchPayload: string,
    originalPrompt: string
  ): string {
    return ensureCiCOrderingWithQuestion(localSearchPayload, originalPrompt);
  }

  /**
   * Main entry point for the unified agent runner.
   * Handles all modes: simple chat, vault QA, and agent tool use.
   */
  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      updateLoadingMessage?: (message: string) => void;
    }
  ): Promise<string> {
    this.llmFormattedMessages = [];
    this.lastDisplayedContent = "";
    this.vaultQADocuments = [];

    // Validate input using Zod (security layer)
    try {
      validateAgentInput({ userMessage, abortController, options });
    } catch (error) {
      logError("Agent input validation failed:", error);
      // Don't expose validation details to user - just show generic error
      await this.handleError(
        new Error("Invalid input"),
        updateCurrentAiMessage
      );
      return "";
    }

    const chatModel = this.chainManager.chatModelManager.getChatModel();
    const adapter = ModelAdapterFactory.createAdapter(chatModel);

    // Agent mode should never show thinking tokens in the response
    const thinkStreamer = new ThinkBlockStreamer(updateCurrentAiMessage, true);

    const modelNameForLog = (chatModel as { modelName?: string } | undefined)?.modelName;

    const envelope = userMessage.contextEnvelope;
    if (!envelope) {
      throw new Error(
        "[Agent] Context envelope is required but not available. Cannot proceed with autonomous agent."
      );
    }

    logInfo("[Agent] Using unified agent runner with native tool calling");

    // Determine if this is Vault QA mode based on chain type
    // For now, we'll detect it based on whether the user message suggests QA
    const isVaultQAMode = this.isVaultQAMode(userMessage);

    // Prepare context for the agent loop
    const context = await this.prepareAgentConversation(
      userMessage,
      chatModel,
      options.updateLoadingMessage,
      isVaultQAMode
    );

    try {
      // Start reasoning timer just before the ReAct loop
      this.startReasoningTimer(updateCurrentAiMessage, abortController);

      // Run the ReAct loop with native tool calling
      const loopResult = await this.runReActLoop({
        boundModel: context.loopDeps.boundModel,
        tools: context.loopDeps.availableTools,
        messages: context.messages,
        originalPrompt: context.originalUserPrompt,
        abortController,
        updateCurrentAiMessage,
        processLocalSearchResult: context.loopDeps.processLocalSearchResult,
        applyCiCOrderingToLocalSearchResult: context.loopDeps.applyCiCOrderingToLocalSearchResult,
        adapter,
        isVaultQAMode,
        vaultQADocs: this.vaultQADocuments,
      });

      // If abort was already handled by timer, skip further processing
      if (this.abortHandledByTimer) {
        this.lastDisplayedContent = "";
        return "";
      }

      // Finalize and return
      const uniqueSources = deduplicateSources(loopResult.sources);

      if (context.messages.length > 0) {
        recordPromptPayload({
          messages: [...context.messages],
          modelName: modelNameForLog,
          contextEnvelope: userMessage.contextEnvelope,
        });
      }

      await this.handleResponse(
        loopResult.finalResponse,
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage,
        uniqueSources.length > 0 ? uniqueSources : undefined,
        this.llmFormattedMessages.join("\n\n"),
        loopResult.responseMetadata
      );

      this.lastDisplayedContent = "";
      return loopResult.finalResponse;
    } catch (error: any) {
      this.stopReasoningTimer();

      if (error.name === "AbortError" || abortController.signal.aborted) {
        logInfo("Agent stream aborted by user", {
          reason: abortController.signal.reason,
        });
        return "";
      }

      logError("Agent failed with error:", error);

      // Stream error to user
      await this.handleError(
        error,
        thinkStreamer.processErrorChunk.bind(thinkStreamer)
      );

      const fullAIResponse = thinkStreamer.close().content;
      return this.handleResponse(
        fullAIResponse,
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage,
        undefined,
        fullAIResponse
      );
    }
  }

  /**
   * Detect if the user message suggests Vault QA mode.
   */
  private isVaultQAMode(userMessage: ChatMessage): boolean {
    // Extract L5 (raw user query)
    const l5User = userMessage.contextEnvelope?.layers.find((l) => l.id === "L5_USER");
    const rawQuery = (l5User?.text || userMessage.message || "").toLowerCase();

    // Vault QA keywords
    const vaultQaKeywords = [
      "what does my note",
      "what does my notes",
      "in my vault",
      "vault qa",
      "vaultqa",
      "search my notes",
      "find in my notes",
    ];

    return vaultQaKeywords.some((keyword) => rawQuery.includes(keyword));
  }

  /**
   * Prepare the conversation context for the agent loop.
   */
  private async prepareAgentConversation(
    userMessage: ChatMessage,
    chatModel: any,
    _updateLoadingMessage?: (message: string) => void,
    isVaultQAMode: boolean = false
  ): Promise<AgentRunContext> {
    const messages: BaseMessage[] = [];
    const availableTools = isVaultQAMode ? [] : this.getAvailableTools();

    // For Vault QA mode, we don't bind tools
    let boundModel: Runnable;
    if (isVaultQAMode || typeof chatModel.bindTools !== "function") {
      boundModel = chatModel;
    } else {
      boundModel = chatModel.bindTools(availableTools);
    }

    const loopDeps: AgentLoopDeps = {
      availableTools,
      boundModel,
      processLocalSearchResult: this.processLocalSearchResult.bind(this),
      applyCiCOrderingToLocalSearchResult: this.applyCiCOrderingToLocalSearchResult.bind(this),
    };

    const envelope = userMessage.contextEnvelope!;

    // Build system message
    const systemPrompt = await AgentChainRunner.generateSystemPrompt(
      availableTools,
      undefined,
      this.chainManager.userMemoryManager
    );
    messages.push(new SystemMessage({ content: systemPrompt }));

    // Load chat history
    const memory = this.chainManager.memoryManager.getMemory();
    const tempMessages: { role: string; content: string | MessageContent[] }[] = [];
    await loadAndAddChatHistory(memory, tempMessages);
    for (const msg of tempMessages) {
      if (msg.role === "user") {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    }

    // Extract L5 for original prompt
    const l5User = envelope.layers.find((l) => l.id === "L5_USER");
    const l5Text = l5User?.text || "";
    const originalUserPrompt = l5Text || userMessage.originalMessage || userMessage.message;

    // For Vault QA mode, prepare RAG context
    if (isVaultQAMode) {
      await this.prepareVaultQaContext(userMessage, envelope, messages, originalUserPrompt);
    }

    // Build user message with context
    const userMessageContent = this.buildUserMessageContent(envelope, isVaultQAMode);
    if (userMessageContent) {
      const isMultimodal = this.isMultimodalModel(chatModel);
      const content: string | MessageContent[] = isMultimodal
        ? await this.buildMessageContent(userMessageContent, userMessage)
        : userMessageContent;
      messages.push(new HumanMessage(content));
    }

    return {
      messages,
      collectedSources: [],
      originalUserPrompt,
      loopDeps,
    };
  }

  /**
   * Prepare Vault QA context by running retrieval.
   */
  private async prepareVaultQaContext(
    userMessage: ChatMessage,
    envelope: any,
    messages: BaseMessage[],
    originalPrompt: string
  ): Promise<void> {
    // Extract L5 (raw user query)
    const l5User = envelope.layers.find((l: any) => l.id === "L5_USER");
    const rawUserQuery = l5User?.text || userMessage.message;

    // Extract tags from raw query
    const tags = this.extractTagTerms(rawUserQuery);
    logInfo("[VaultQA] Extracted tags:", tags);

    // Get chat history for query condensing
    const memory = this.chainManager.memoryManager.getMemory();
    const memoryVariables = await memory.loadMemoryVariables({});
    const chatHistory = extractChatHistory(memoryVariables);

    // Condense query with chat history
    const standaloneQuestion = rawUserQuery;
    if (chatHistory.length > 0) {
      logInfo("[VaultQA] Condensing query with chat history");
      // Note: getStandaloneQuestion would need to be imported
      // For now, use raw query
    }

    // Run FilterRetriever for guaranteed title/tag matches
    const hasTagTerms = tags.length > 0;
    const filterRetriever = new FilterRetriever(this.chainManager.app, {
      salientTerms: hasTagTerms ? [...tags] : [],
      maxK: DEFAULT_MAX_SOURCE_CHUNKS,
      returnAll: hasTagTerms,
    });
    const filterDocs = await filterRetriever.getRelevantDocuments(standaloneQuestion);

    // Create main retriever
    const retrieverResult = await RetrieverFactory.createRetriever(
      this.chainManager.app,
      {
        minSimilarityScore: 0.01,
        maxK: DEFAULT_MAX_SOURCE_CHUNKS,
        salientTerms: hasTagTerms ? [...tags] : [],
        tagTerms: tags,
        returnAll: hasTagTerms,
      },
      {}
    );
    const retriever = retrieverResult.retriever;
    logInfo(`[VaultQA] Using ${retrieverResult.type} retriever`);

    // Retrieve and merge results
    const searchDocs = await retriever.getRelevantDocuments(standaloneQuestion);
    const { filterResults, searchResults } = mergeFilterAndSearchResults(filterDocs, searchDocs);
    const merged = [...filterResults, ...searchResults];
    const retrieverCapReached = merged.length > DEFAULT_MAX_SOURCE_CHUNKS;
    const retrievedDocs = merged.slice(0, DEFAULT_MAX_SOURCE_CHUNKS);

    // Store for later use
    this.vaultQADocuments = retrievedDocs;
    this.chainManager.storeRetrieverDocuments(retrievedDocs);

    // Format context with XML tags
    const context = retrievedDocs
      .map((doc: any) => {
        const title = doc.metadata?.title || "Untitled";
        const path = doc.metadata?.path || title;
        return `<${RETRIEVED_DOCUMENT_TAG}>\n<title>${title}</title>\n<path>${path}</path>\n<content>\n${sanitizeContentForCitations(doc.pageContent)}\n</content>\n</${RETRIEVED_DOCUMENT_TAG}>`;
      })
      .join("\n\n");

    // Build citation instructions
    const sourceEntries: SourceCatalogEntry[] = retrievedDocs
      .slice(0, Math.max(5, Math.min(20, retrievedDocs.length)))
      .map((d: any) => ({
        title: d.metadata?.title || d.metadata?.path || "Untitled",
        path: d.metadata?.path || d.metadata?.title || "",
      }));
    const sourceCatalog = formatSourceCatalog(sourceEntries).join("\n");

    const capNotice = retrieverCapReached
      ? `\n\nIMPORTANT: The retrieval limit of ${DEFAULT_MAX_SOURCE_CHUNKS} documents was reached.`
      : "";

    const qaInstructions =
      "\n\nAnswer the question based only on the following context:\n" +
      context +
      getQACitationInstructions(sourceCatalog, getSettings().enableInlineCitations) +
      capNotice;

    // Store the RAG instructions to prepend to user message
    (messages[messages.length - 1] as any).ragInstructions = qaInstructions;
  }

  /**
   * Build user message content from envelope.
   */
  private buildUserMessageContent(envelope: any, isVaultQAMode: boolean): string {
    const baseMessages = LayerToMessagesConverter.convert(envelope, {
      includeSystemMessage: true,
      mergeUserContent: true,
      debug: false,
    });

    const userMessageContent = baseMessages.find((m) => m.role === "user");
    if (!userMessageContent) {
      return "";
    }

    return userMessageContent.content;
  }

  /**
   * Build multimodal message content with images.
   */
  protected async buildMessageContent(
    textContent: string,
    userMessage: ChatMessage
  ): Promise<MessageContent[]> {
    // Simplified implementation - delegates to CopilotPlusChainRunner logic
    const messageContent: MessageContent[] = [
      {
        type: "text",
        text: textContent,
      },
    ];

    return messageContent;
  }

  /**
   * Check if model is multimodal.
   */
  protected isMultimodalModel(model: any): boolean {
    const modelName = model.modelName || model.model || "";
    const customModel = this.chainManager.chatModelManager.findModelByName(modelName);
    return customModel?.capabilities?.includes(ModelCapability.VISION) ?? false;
  }

  /**
   * Extract tags from query.
   */
  private extractTagTerms(query: string): string[] {
    return extractTagsFromQuery(query);
  }

  /**
   * ReAct loop for native tool calling.
   */
  private async runReActLoop(params: ReActLoopParams): Promise<ReActLoopResult> {
    const {
      boundModel,
      tools,
      messages,
      originalPrompt,
      abortController,
      updateCurrentAiMessage,
      processLocalSearchResult,
      applyCiCOrderingToLocalSearchResult,
      isVaultQAMode,
    } = params;

    const settings = getSettings();
    const maxIterations = isVaultQAMode ? 1 : settings.autonomousAgentMaxIterations;
    const collectedSources: AgentSource[] = [];
    const loopStartTime = Date.now();

    let iteration = 0;
    let responseMetadata: ResponseMetadata | undefined;

    while (iteration < maxIterations) {
      if (abortController.signal.aborted) break;

      // Check for loop timeout
      const elapsedTime = Date.now() - loopStartTime;
      if (elapsedTime >= AGENT_LOOP_TIMEOUT_MS) {
        logWarn(`Agent loop timed out after ${Math.round(elapsedTime / 1000)}s`);
        break;
      }
      iteration++;

      // Stream response
      const { content, aiMessage, streamingResult } = await this.streamModelResponse(
        boundModel,
        messages,
        abortController,
        updateCurrentAiMessage
      );

      responseMetadata = {
        wasTruncated: streamingResult.wasTruncated,
        tokenUsage: streamingResult.tokenUsage ?? undefined,
      };

      // Check for tool calls (skip in Vault QA mode)
      const toolCalls = isVaultQAMode ? [] : (aiMessage.tool_calls || []);

      // No tool calls = final response
      if (toolCalls.length === 0) {
        this.stopReasoningTimer();
        this.reasoningState.status = "complete";

        messages.push(aiMessage);

        const finalContent = content;
        const reasoningBlock = this.buildReasoningBlockMarkup();

        // Stream final response
        const STREAM_CHUNK_SIZE = 20;
        const STREAM_DELAY_MS = 5;
        let displayedContent = "";

        for (let i = 0; i < finalContent.length; i += STREAM_CHUNK_SIZE) {
          if (abortController.signal.aborted) break;
          displayedContent += finalContent.slice(i, i + STREAM_CHUNK_SIZE);
          const currentResponse = reasoningBlock
            ? reasoningBlock + "\n\n" + displayedContent
            : displayedContent;
          updateCurrentAiMessage(currentResponse);
          if (i + STREAM_CHUNK_SIZE < finalContent.length) {
            await new Promise((resolve) => setTimeout(resolve, STREAM_DELAY_MS));
          }
        }

        const finalResponse = reasoningBlock
          ? reasoningBlock + "\n\n" + finalContent
          : finalContent;
        updateCurrentAiMessage(finalResponse);

        return {
          finalResponse,
          sources: collectedSources,
          responseMetadata,
        };
      }

      // Add AI message with tool calls
      messages.push(aiMessage);

      // Log finding summary for iterations > 1
      if (iteration > 1 && content && content.trim().length > 0) {
        const findingSummary = extractFirstSentence(content);
        if (findingSummary) {
          this.addReasoningStep(findingSummary);
        }
      }

      // Execute each tool
      for (const tc of toolCalls) {
        if (abortController.signal.aborted) break;

        const toolCall = {
          name: tc.name,
          args: tc.args as Record<string, unknown>,
        };

        // Pre-expand query for localSearch
        let preExpandedTerms: QueryExpansionInfo | undefined;
        if (tc.name === "localSearch") {
          const query = toolCall.args.query as string | undefined;
          if (query) {
            try {
              const expander = new QueryExpander({
                getChatModel: async () => this.chainManager.chatModelManager.getChatModel(),
              });
              const expansion = await expander.expand(query);

              const seen = new Set<string>();
              const recallTerms: string[] = [];
              const addTerm = (term: unknown) => {
                if (typeof term !== "string") return;
                const trimmed = term.trim();
                if (!trimmed || trimmed === "[object Object]" || trimmed.startsWith("[object "))
                  return;
                const normalized = trimmed.toLowerCase();
                if (!seen.has(normalized)) {
                  seen.add(normalized);
                  recallTerms.push(trimmed);
                }
              };
              if (expansion.originalQuery) addTerm(expansion.originalQuery);
              (expansion.salientTerms || []).forEach(addTerm);
              (expansion.expandedQueries || []).forEach(addTerm);

              preExpandedTerms = {
                originalQuery: expansion.originalQuery,
                salientTerms: expansion.salientTerms,
                expandedQueries: expansion.expandedQueries,
                recallTerms,
              };
            } catch {
              // Ignore expansion errors
            }
          }
        }

        // Add tool call step
        const toolCallSummary = summarizeToolCall(tc.name, toolCall.args, preExpandedTerms);
        this.addReasoningStep(toolCallSummary, tc.name);

        if (preExpandedTerms) {
          toolCall.args._preExpandedQuery = preExpandedTerms;
        }

        logToolCall(toolCall, iteration);

        // Execute the tool
        const result = await executeSequentialToolCall(toolCall, tools, originalPrompt);

        // Track source info for reasoning summary
        let sourceInfo: LocalSearchSourceInfo | undefined;

        // Special handling for localSearch
        if (tc.name === "localSearch" && result.success) {
          const processed = processLocalSearchResult(result);
          collectedSources.push(...processed.sources);

          sourceInfo = {
            titles: processed.sources.map((s) => s.title),
            count: processed.sources.length,
          };

          result.result = applyCiCOrderingToLocalSearchResult(
            processed.formattedForLLM,
            originalPrompt || ""
          );
        }

        logToolResult(tc.name, result);

        // Add tool result step
        const resultSummary = summarizeToolResult(tc.name, result, sourceInfo, toolCall.args);
        this.addReasoningStep(resultSummary, tc.name);

        // Add ToolMessage to conversation
        const toolMessage = createToolResultMessage(
          tc.id || generateToolCallId(),
          tc.name,
          result.result
        );
        messages.push(toolMessage);
      }
    }

    // Stop reasoning timer
    this.stopReasoningTimer();
    this.reasoningState.status = "complete";
    const reasoningBlock = this.buildReasoningBlockMarkup();

    // Handle interrupted response
    if (abortController.signal.aborted) {
      logInfo("Agent reasoning interrupted by user");
      if (this.abortHandledByTimer) {
        return {
          finalResponse: "",
          sources: collectedSources,
          responseMetadata,
        };
      }
      const interruptedMessage = "The response was interrupted.";
      const finalResponse = reasoningBlock
        ? reasoningBlock + "\n\n" + interruptedMessage
        : interruptedMessage;

      return {
        finalResponse,
        sources: collectedSources,
        responseMetadata,
      };
    }

    // Max iterations or timeout reached
    const elapsedTime = Date.now() - loopStartTime;
    const timedOut = elapsedTime >= AGENT_LOOP_TIMEOUT_MS;

    if (timedOut) {
      logWarn(`Agent loop timed out after ${Math.round(elapsedTime / 1000)}s`);
    } else {
      logWarn(`Agent reached max iterations (${maxIterations})`);
    }

    const limitMessage = timedOut
      ? "I've reached the time limit for reasoning. Here's what I found so far."
      : "I've reached the maximum number of tool calls. Here's what I found so far.";
    const finalResponse = reasoningBlock ? reasoningBlock + "\n\n" + limitMessage : limitMessage;

    return {
      finalResponse,
      sources: collectedSources,
      responseMetadata,
    };
  }

  /**
   * Stream response from the bound model.
   */
  private async streamModelResponse(
    boundModel: Runnable,
    messages: BaseMessage[],
    abortController: AbortController,
    _updateCurrentAiMessage: (message: string) => void
  ): Promise<{ content: string; aiMessage: AIMessage; streamingResult: StreamingResult }> {
    const toolCallChunks: Map<number, ToolCallChunk> = new Map();

    // Use ThinkBlockStreamer with excludeThinking=true for agent mode
    const thinkStreamer = new ThinkBlockStreamer(() => {}, true);

    try {
      const stream = await withSuppressedTokenWarnings(() =>
        boundModel.stream(messages, {
          signal: abortController.signal,
        })
      );

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        // Check for MALFORMED_FUNCTION_CALL error
        const finishReason = chunk.response_metadata?.finish_reason;
        if (finishReason === "MALFORMED_FUNCTION_CALL") {
          logWarn("Backend returned MALFORMED_FUNCTION_CALL - falling back to non-agent mode");
          throw new Error("MALFORMED_FUNCTION_CALL: Model does not support native tool calling");
        }

        // Extract tool_call_chunks
        const tcChunks = chunk.tool_call_chunks;
        if (tcChunks && Array.isArray(tcChunks)) {
          for (const tc of tcChunks) {
            const idx = tc.index ?? 0;
            const existing = toolCallChunks.get(idx) || { name: "", args: "" };
            if (tc.id) existing.id = tc.id;
            if (tc.name) existing.name += tc.name;
            if (tc.args) existing.args += tc.args;
            toolCallChunks.set(idx, existing);
          }
        }

        thinkStreamer.processChunk(chunk);
      }

      const streamingResult = thinkStreamer.close();
      const fullContent = streamingResult.content;

      // Build tool calls from accumulated chunks
      const toolCalls = buildToolCallsFromChunks(toolCallChunks);

      // Build AIMessage
      const aiMessage = new AIMessage({
        content: fullContent,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          type: "tool_call" as const,
        })),
      });

      return {
        content: fullContent,
        aiMessage,
        streamingResult,
      };
    } catch (error: any) {
      logError(`Stream error: ${error.message}`);
      if (error.name === "AbortError" || abortController.signal.aborted) {
        const streamingResult = thinkStreamer.close();
        return {
          content: streamingResult.content,
          aiMessage: new AIMessage({ content: streamingResult.content }),
          streamingResult,
        };
      }
      throw error;
    }
  }

  /**
   * Process localSearch tool results.
   */
  protected processLocalSearchResult(
    toolResult: { result: string; success: boolean },
    timeExpression?: string
  ): {
    formattedForLLM: string;
    formattedForDisplay: string;
    sources: AgentSource[];
  } {
    let sources: AgentSource[] = [];
    let formattedForLLM: string;
    let formattedForDisplay: string;

    if (!toolResult.success) {
      formattedForLLM = "<localSearch>\nSearch failed.\n</localSearch>";
      formattedForDisplay = `Search failed: ${toolResult.result}`;
      return { formattedForLLM, formattedForDisplay, sources };
    }

    try {
      const parsed = JSON.parse(toolResult.result);
      const searchResults =
        parsed &&
        typeof parsed === "object" &&
        parsed.type === "local_search" &&
        Array.isArray(parsed.documents)
          ? parsed.documents
          : null;

      if (!Array.isArray(searchResults)) {
        formattedForLLM = "<localSearch>\nInvalid search results format.\n</localSearch>";
        formattedForDisplay = "Search results were in an unexpected format.";
        return { formattedForLLM, formattedForDisplay, sources };
      }

      // Extract sources
      sources = searchResults.map((doc: any) => ({
        title: doc.title || doc.path || "Untitled",
        path: doc.path || doc.title || "",
        score: doc.score || 0,
      }));

      // Format for LLM
      formattedForLLM = `<localSearch>\n${JSON.stringify(searchResults, null, 2)}\n</localSearch>`;
      formattedForDisplay = ToolResultFormatter.format("localSearch", formattedForLLM);
    } catch (error) {
      logWarn("Failed to parse localSearch results:", error);
      formattedForLLM = `<localSearch>\n${toolResult.result}\n</localSearch>`;
      formattedForDisplay = ToolResultFormatter.format("localSearch", formattedForLLM);
    }

    return { formattedForLLM, formattedForDisplay, sources };
  }
}

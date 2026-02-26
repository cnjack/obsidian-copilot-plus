# AgentChainRunner Architecture

## Overview

The `AgentChainRunner` is a unified chain runner that consolidates the functionality of multiple separate runners (`LLMChainRunner`, `VaultQAChainRunner`, `CopilotPlusChainRunner`, and `AutonomousAgentChainRunner`) into a single cohesive implementation.

**Location:** `src/LLMProviders/chainRunner/AgentChainRunner.ts`

## Design Principles

1. **Agentic-by-Default**: The agent automatically decides whether to use tools based on the user's query
2. **Unified Context System**: All context sources (note refs, vault search, web search) flow through the same pipeline
3. **State Machine Pattern**: Clear states for the agentic loop with proper error handling
4. **Input Validation**: Zod schema validation at the agent boundary for security
5. **Graceful Degradation**: Falls back to simpler modes when advanced features aren't available

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AgentChainRunner                                 │
│                          extends BaseChainRunner                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Input Validation Layer                        │    │
│  │              (Zod Schema Validation)                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                   │                                      │
│                                   ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Mode Detection                                │    │
│  │         - Simple Chat (no tools)                                 │    │
│  │         - Vault QA (RAG-based)                                   │    │
│  │         - Agent (tool use)                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                   │                                      │
│                                   ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Context Preparation                           │    │
│  │         - System prompt with tool guidelines                     │    │
│  │         - Chat history loading                                   │    │
│  │         - RAG context (Vault QA mode)                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                   │                                      │
│                                   ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ReAct Loop (State Machine)                    │    │
│  │                                                                  │    │
│  │   IDLE → PLANNING → EXECUTING → OBSERVING → RESPONDING          │    │
│  │     │         │            │            │            │           │    │
│  │     │         │            │            │            └─► Done    │    │
│  │     │         │            │            └──────────────────────► │    │
│  │     │         │            └──────────────────────────────────►  │    │
│  │     │         └──────────────────────────────────────────────►   │    │
│  │     └────────────────────────────────────────────────────────►   │    │
│  │                                                                  │    │
│  │   [Max: N iterations | Timeout: 5 min]                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                   │                                      │
│                                   ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Tool Execution Paths                          │    │
│  │                                                                  │    │
│  │   ┌─────────────────────┐      ┌─────────────────────────────┐  │    │
│  │   │  Native Tool Call   │      │   ReAct Fallback            │  │    │
│  │   │  (bindTools)        │      │   (XML format)              │  │    │
│  │   │  [PRIMARY]          │      │   [FALLBACK]                │  │    │
│  │   └─────────────────────┘      └─────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                   │                                      │
│                                   ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Response Streaming                            │    │
│  │         - ThinkBlockStreamer (strip thinking tokens)             │    │
│  │         - Reasoning block with timer                             │    │
│  │         - Progressive content display                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## State Machine Details

### States

| State | Description | Trigger |
|-------|-------------|---------|
| **IDLE** | Initial state, waiting for user input | Entry point |
| **PLANNING** | Analyzing request, deciding on tool usage | After context prep |
| **EXECUTING** | Calling tools, gathering information | Tool call detected |
| **OBSERVING** | Processing tool results | Tool execution complete |
| **RESPONDING** | Generating final response | No more tool calls needed |

### Transitions

```
IDLE ──► PLANNING ──► EXECUTING ──► OBSERVING ──┐
   ▲                                            │
   │                                            │
   └────────────── RESPONDING ◄─────────────────┘
                        │
                        ▼
                      DONE
```

### Exit Conditions

1. **No tool calls detected** → Final response
2. **Max iterations reached** → Response with partial results
3. **Timeout (5 min)** → Response with partial results
4. **User abort** → Interrupted message

## Key Components

### 1. Zod Input Validation

```typescript
const AgentInputSchema = z.object({
  userMessage: z.object({
    message: z.string(),
    originalMessage: z.string().optional(),
    content: z.any().optional(),
    contextEnvelope: z.any().optional(),
  }),
  abortController: z.instanceof(AbortController),
  options: z.object({
    debug: z.boolean().optional(),
    ignoreSystemMessage: z.boolean().optional(),
    updateLoading: z.function().optional(),
    updateLoadingMessage: z.function().optional(),
  }).optional(),
});
```

### 2. Mode Detection

The runner automatically detects the mode based on:
- **Vault QA Mode**: Keywords like "what does my note", "in my vault", "search my notes"
- **Agent Mode**: Default for Plus users
- **Simple Chat**: Falls back when tools aren't needed

### 3. Reasoning Timer

Provides visual feedback during tool execution:
- Updates every 100ms
- Shows rolling window of last 4 steps
- Randomized initial step for variety
- Full history available after completion

### 4. Tool Execution

Two execution paths:

**Native Tool Calling (Primary)**:
- Uses `bindTools()` for OpenAI, Anthropic, etc.
- Tool calls parsed from `tool_call_chunks`
- Type-safe argument passing

**ReAct Fallback**:
- XML format for models without native support
- Parse tool calls from response content
- Graceful degradation

## Integration Points

### With Context System

```
User Message
     │
     ▼
┌─────────────────┐
│ ContextEnvelope │
│  - L1: System   │
│  - L2: Notes    │
│  - L3: Smart    │
│  - L4: History  │
│  - L5: Raw      │
└─────────────────┘
     │
     ▼
LayerToMessagesConverter
     │
     ▼
BaseMessage[]
```

### With Tool Registry

```
AgentChainRunner
     │
     ▼
ToolRegistry.getInstance()
     │
     ▼
getEnabledTools()
     │
     ▼
StructuredTool[]
```

### With Memory System

```
AgentChainRunner
     │
     ▼
memoryManager.getMemory()
     │
     ▼
loadMemoryVariables()
     │
     ▼
Chat History → BaseMessage[]
```

## Error Handling

### Validation Errors
- Caught at entry point
- Generic error shown to user
- Detailed error logged

### Tool Execution Errors
- Logged with full context
- Agent loop continues if possible
- Final response includes available results

### Stream Errors
- AbortError handled gracefully
- No error message for user-initiated aborts
- Fallback to simpler mode on critical failures

## Testing Strategy

### Unit Tests
- Input validation schema
- Mode detection logic
- State machine transitions
- Tool call parsing

### Integration Tests
- End-to-end agent loop
- Native tool calling path
- ReAct fallback path
- Vault QA mode

### Verification Checklist
- [ ] Simple prompt bypasses tool execution
- [ ] Tool-requiring prompt triggers loop
- [ ] State transitions match designed flow
- [ ] Reasoning timer displays correctly
- [ ] Abort handling works gracefully

## Migration Path

The `AgentChainRunner` is designed to coexist with existing runners during migration:

1. **Phase 1**: Deploy alongside existing runners (current)
2. **Phase 2**: Gradual traffic shifting to new runner
3. **Phase 3**: Deprecate old runners
4. **Phase 4**: Remove old runners

## Configuration

### Settings Used

| Setting | Default | Description |
|---------|---------|-------------|
| `autonomousAgentEnabledToolIds` | `[]` | Enabled tools for agent |
| `autonomousAgentMaxIterations` | `5` | Max tool calls per request |
| `enableInlineCitations` | `true` | Enable citation formatting |

### Model Requirements

| Feature | Requirement |
|---------|-------------|
| Native Tool Calling | `bindTools()` support |
| Streaming | Required for UX |
| Reasoning | Optional (ThinkBlockStreamer handles) |

## Future Enhancements

1. **Parallel Tool Execution**: Run independent tools concurrently
2. **Tool Selection Learning**: Learn which tools work best for which queries
3. **Cost Optimization**: Track and optimize token usage
4. **Advanced RAG**: Improve Vault QA retrieval quality
5. **Multi-Modal Support**: Image and file handling improvements

## Related Files

- `src/LLMProviders/chainRunner/AgentChainRunner.ts` - Main implementation
- `src/LLMProviders/chainRunner/index.ts` - Exports
- `src/LLMProviders/chainRunner/utils/` - Utility functions
- `src/tools/ToolRegistry.ts` - Tool registration system
- `src/context/LayerToMessagesConverter.ts` - Context processing

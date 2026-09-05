/**
 * @codexa/agent — Public API
 *
 * Export the core building blocks:
 *   - Provider abstraction (createLanguageModel, testProviderConnection, listOllamaModels)
 *   - Context engine (ContextEngine)
 *   - Multi-agent orchestrator (AgentOrchestrator)
 *   - Tool executor (createAgentTools)
 */

export * from "./providers/index.ts";
export * from "./context/engine.ts";
export * from "./orchestrator/index.ts";
export * from "./tools/executor.ts";

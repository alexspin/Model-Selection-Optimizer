export { SmartRouter } from "./router/router.js";
export { ModelRegistry } from "./models/registry.js";
export { analyzePrompt, analyzePromptWithClassifications } from "./analyzers/prompt-analyzer.js";
export { SemanticClassifier } from "./analyzers/semantic-classifier.js";
export type { ClassificationResult, SemanticClassifierConfig } from "./analyzers/semantic-classifier.js";
export { CostTracker } from "./utils/cost-tracker.js";
export { defaultRouterConfig, createRouterConfig } from "./config/defaults.js";
export {
  defaultClassifications,
  loadClassifications,
  mergeClassifications,
} from "./config/classifications.js";
export type { ClassificationDefinition } from "./config/classifications.js";
export {
  capabilityStrategy,
  costStrategy,
  latencyStrategy,
  complexityStrategy,
  contextWindowStrategy,
  allStrategies,
  getStrategyByName,
} from "./strategies/index.js";
export { scoreModels } from "./router/scoring-engine.js";
export { LLMMetaRouter } from "./router/meta-router.js";
export { SmartRouterBridge, parseRoutePrefix } from "./plugin/bridge.js";
export type { SmartRouterPluginConfig, BridgeLogger, ResolveResult } from "./plugin/bridge.js";
export {
  loadRoutingConfig,
  getModelForClass,
  getClassForCommand,
  getFallbackModel,
  getFallbackClass,
} from "./config/routing-config.js";
export type { RoutingConfig, ClassConfig } from "./config/routing-config.js";
export type {
  ModelProfile,
  ModelCapability,
  ModelTier,
  ModelProvider,
  ModelPricing,
  PromptAnalysis,
  RoutingDecision,
  RoutingContext,
  RoutingStrategy,
  StrategyConfig,
  RouterConfig,
  ConversationTurn,
  BudgetConstraint,
  UserPreferences,
} from "./types/index.js";

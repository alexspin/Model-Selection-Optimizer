import { z } from "zod";

export const ModelCapabilitySchema = z.enum([
  "text-generation",
  "code-generation",
  "reasoning",
  "summarization",
  "translation",
  "creative-writing",
  "data-analysis",
  "function-calling",
  "vision",
  "long-context",
]);

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelTierSchema = z.enum(["frontier", "mid", "budget", "local"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const ModelProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "ollama",
  "lmstudio",
  "huggingface",
  "custom",
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export interface ModelPricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  cacheReadPerMillionTokens?: number;
  cacheWritePerMillionTokens?: number;
}

export interface ModelProfile {
  id: string;
  provider: ModelProvider;
  modelId: string;
  displayName: string;
  tier: ModelTier;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens: number;
  pricing: ModelPricing;
  averageLatencyMs: number;
  qualityScores: Record<ModelCapability, number>;
  isLocal: boolean;
  enabled: boolean;
}

export interface PromptAnalysis {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  detectedCapabilities: ModelCapability[];
  complexity: "simple" | "moderate" | "complex";
  requiresReasoning: boolean;
  requiresCodeGen: boolean;
  requiresLongContext: boolean;
  requiresVision: boolean;
  conversationDepth: number;
  rawPrompt: string;
}

export interface RoutingDecision {
  selectedModel: ModelProfile;
  reason: string;
  score: number;
  alternativeModels: Array<{ model: ModelProfile; score: number }>;
  estimatedCost: number;
  strategy: string;
  timestamp: number;
}

export interface RoutingContext {
  conversationHistory: ConversationTurn[];
  budget?: BudgetConstraint;
  userPreferences?: UserPreferences;
  sessionId: string;
}

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
  modelUsed?: string;
  tokensUsed?: number;
  costIncurred?: number;
  latencyMs?: number;
  timestamp: number;
}

export interface BudgetConstraint {
  maxCostPerTurn: number;
  maxCostPerSession: number;
  currentSessionCost: number;
  preferCheaper: boolean;
}

export interface UserPreferences {
  preferredTier?: ModelTier;
  preferredProviders?: ModelProvider[];
  blockedModels?: string[];
  prioritizeSpeed?: boolean;
  prioritizeQuality?: boolean;
  prioritizeCost?: boolean;
}

export interface StrategyConfig {
  name: string;
  weight: number;
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface RouterConfig {
  strategies: StrategyConfig[];
  fallbackModel: string;
  enableMetaRouting: boolean;
  metaRoutingModel?: string;
  budgetDefaults: BudgetConstraint;
  logging: boolean;
}

export interface RoutingStrategy {
  name: string;
  score(
    prompt: PromptAnalysis,
    model: ModelProfile,
    context: RoutingContext,
    config: StrategyConfig
  ): number;
}

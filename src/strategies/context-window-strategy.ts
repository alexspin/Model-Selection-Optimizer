import type {
  RoutingStrategy,
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  StrategyConfig,
} from "../types/index.js";

export const contextWindowStrategy: RoutingStrategy = {
  name: "context-window-fit",

  score(
    prompt: PromptAnalysis,
    model: ModelProfile,
    _context: RoutingContext,
    _config: StrategyConfig
  ): number {
    const totalTokensNeeded = prompt.estimatedInputTokens + prompt.estimatedOutputTokens;

    if (totalTokensNeeded > model.contextWindow) return 0;

    const utilization = totalTokensNeeded / model.contextWindow;

    if (utilization < 0.01) return 0.7;
    if (utilization < 0.1) return 0.9;
    if (utilization < 0.5) return 1.0;
    if (utilization < 0.8) return 0.8;
    return 0.5;
  },
};

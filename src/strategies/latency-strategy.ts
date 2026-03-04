import type {
  RoutingStrategy,
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  StrategyConfig,
} from "../types/index.js";

export const latencyStrategy: RoutingStrategy = {
  name: "latency-optimization",

  score(
    _prompt: PromptAnalysis,
    model: ModelProfile,
    context: RoutingContext,
    _config: StrategyConfig
  ): number {
    const maxAcceptableLatency = 10000;
    const normalized = Math.min(model.averageLatencyMs / maxAcceptableLatency, 1.0);
    let score = 1.0 - normalized;

    if (context.userPreferences?.prioritizeSpeed) {
      score = Math.pow(score, 0.5);
    }

    return score;
  },
};

import type {
  RoutingStrategy,
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  StrategyConfig,
} from "../types/index.js";

export const complexityStrategy: RoutingStrategy = {
  name: "complexity-tier-match",

  score(
    prompt: PromptAnalysis,
    model: ModelProfile,
    _context: RoutingContext,
    _config: StrategyConfig
  ): number {
    const tierRank: Record<string, number> = {
      local: 0,
      budget: 1,
      mid: 2,
      frontier: 3,
    };

    const complexityRank: Record<string, number> = {
      simple: 0,
      moderate: 1,
      complex: 2,
    };

    const modelRank = tierRank[model.tier];
    const promptRank = complexityRank[prompt.complexity];

    if (prompt.complexity === "complex" && model.tier === "frontier") return 1.0;
    if (prompt.complexity === "complex" && model.tier === "mid") return 0.7;
    if (prompt.complexity === "moderate" && model.tier === "mid") return 1.0;
    if (prompt.complexity === "moderate" && model.tier === "frontier") return 0.6;
    if (prompt.complexity === "moderate" && model.tier === "budget") return 0.7;
    if (prompt.complexity === "simple" && model.tier === "budget") return 1.0;
    if (prompt.complexity === "simple" && model.tier === "local") return 1.0;
    if (prompt.complexity === "simple" && model.tier === "mid") return 0.5;

    const diff = Math.abs(modelRank - promptRank);
    return Math.max(0, 1.0 - diff * 0.3);
  },
};

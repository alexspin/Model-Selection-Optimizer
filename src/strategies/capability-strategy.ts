import type {
  RoutingStrategy,
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  StrategyConfig,
} from "../types/index.js";

export const capabilityStrategy: RoutingStrategy = {
  name: "capability-match",

  score(
    prompt: PromptAnalysis,
    model: ModelProfile,
    _context: RoutingContext,
    _config: StrategyConfig
  ): number {
    if (prompt.detectedCapabilities.length === 0) return 0.5;

    const matchedCapabilities = prompt.detectedCapabilities.filter((cap) =>
      model.capabilities.includes(cap)
    );

    const coverageRatio = matchedCapabilities.length / prompt.detectedCapabilities.length;

    if (coverageRatio < 1.0) {
      const missingCritical = prompt.detectedCapabilities.some(
        (cap) =>
          !model.capabilities.includes(cap) &&
          (cap === "vision" || cap === "function-calling")
      );
      if (missingCritical) return 0;
    }

    if (matchedCapabilities.length === 0) {
      return 0;
    }

    const qualityScore =
      matchedCapabilities.reduce(
        (sum, cap) => sum + (model.qualityScores[cap] || 0.5),
        0
      ) / matchedCapabilities.length;

    return coverageRatio * 0.4 + qualityScore * 0.6;
  },
};

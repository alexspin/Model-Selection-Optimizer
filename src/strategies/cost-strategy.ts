import type {
  RoutingStrategy,
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  StrategyConfig,
} from "../types/index.js";

function estimateCost(prompt: PromptAnalysis, model: ModelProfile): number {
  const inputCost =
    (prompt.estimatedInputTokens / 1_000_000) * model.pricing.inputPerMillionTokens;
  const outputCost =
    (prompt.estimatedOutputTokens / 1_000_000) * model.pricing.outputPerMillionTokens;
  return inputCost + outputCost;
}

export const costStrategy: RoutingStrategy = {
  name: "cost-optimization",

  score(
    prompt: PromptAnalysis,
    model: ModelProfile,
    context: RoutingContext,
    _config: StrategyConfig
  ): number {
    const cost = estimateCost(prompt, model);

    if (model.isLocal) return 1.0;

    if (context.budget) {
      if (cost > context.budget.maxCostPerTurn) return 0;

      const remainingBudget =
        context.budget.maxCostPerSession - context.budget.currentSessionCost;
      if (cost > remainingBudget) return 0;
    }

    const maxReasonableCost = 0.50;
    const normalizedCost = Math.min(cost / maxReasonableCost, 1.0);

    return 1.0 - normalizedCost;
  },
};

export { estimateCost };

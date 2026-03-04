import type {
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  RoutingStrategy,
  StrategyConfig,
} from "../types/index.js";

export interface ScoredModel {
  model: ModelProfile;
  totalScore: number;
  strategyScores: Record<string, number>;
}

export function scoreModels(
  prompt: PromptAnalysis,
  models: ModelProfile[],
  strategies: RoutingStrategy[],
  strategyConfigs: StrategyConfig[],
  context: RoutingContext
): ScoredModel[] {
  const scored: ScoredModel[] = models.map((model) => {
    const strategyScores: Record<string, number> = {};
    let totalScore = 0;
    let totalWeight = 0;

    for (const strategy of strategies) {
      const config = strategyConfigs.find((c) => c.name === strategy.name);
      if (!config || !config.enabled) continue;

      const score = strategy.score(prompt, model, context, config);
      strategyScores[strategy.name] = score;
      totalScore += score * config.weight;
      totalWeight += config.weight;
    }

    return {
      model,
      totalScore: totalWeight > 0 ? totalScore / totalWeight : 0,
      strategyScores,
    };
  });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

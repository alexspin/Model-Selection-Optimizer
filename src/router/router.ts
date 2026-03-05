import type {
  PromptAnalysis,
  RoutingDecision,
  RoutingContext,
  RouterConfig,
  RoutingStrategy,
  ModelProfile,
} from "../types/index.js";
import { ModelRegistry } from "../models/registry.js";
import { analyzePrompt, analyzePromptWithClassifications } from "../analyzers/prompt-analyzer.js";
import { SemanticClassifier, type ClassificationResult } from "../analyzers/semantic-classifier.js";
import { scoreModels } from "./scoring-engine.js";
import { estimateCost } from "../strategies/cost-strategy.js";
import { allStrategies, getStrategyByName } from "../strategies/index.js";
import { LLMMetaRouter } from "./meta-router.js";

export class SmartRouter {
  private registry: ModelRegistry;
  private config: RouterConfig;
  private strategies: RoutingStrategy[];
  private metaRouter?: LLMMetaRouter;
  private semanticClassifier?: SemanticClassifier;
  private routingLog: RoutingDecision[] = [];

  constructor(config: RouterConfig, registry?: ModelRegistry) {
    this.registry = registry || new ModelRegistry();
    this.config = config;
    this.strategies = this.loadStrategies();

    if (config.enableMetaRouting && config.metaRoutingModel) {
      this.metaRouter = new LLMMetaRouter(config.metaRoutingModel);
    }
  }

  setSemanticClassifier(classifier: SemanticClassifier): void {
    this.semanticClassifier = classifier;
  }

  private loadStrategies(): RoutingStrategy[] {
    const loaded: RoutingStrategy[] = [];
    for (const sc of this.config.strategies) {
      if (!sc.enabled) continue;
      const strategy = getStrategyByName(sc.name);
      if (!strategy) {
        console.warn(`[SmartRouter] Unknown strategy '${sc.name}' in config — skipping`);
        continue;
      }
      loaded.push(strategy);
    }
    if (loaded.length === 0) {
      throw new Error("SmartRouter requires at least one enabled strategy");
    }
    return loaded;
  }

  async route(prompt: string, context: RoutingContext): Promise<RoutingDecision> {
    let analysis: PromptAnalysis;
    let classificationResults: ClassificationResult[] | undefined;

    if (this.semanticClassifier) {
      classificationResults = await this.semanticClassifier.classifyWithThreshold(prompt);
      analysis = analyzePromptWithClassifications(
        prompt, classificationResults, context.conversationHistory, this.config.classificationThreshold
      );

      if (this.config.logging && classificationResults.length > 0) {
        const classInfo = classificationResults
          .map((c) => `${c.name}(${c.confidence.toFixed(2)})`)
          .join(", ");
        console.log(`[SmartRouter] Classifications: ${classInfo}`);
      }
    } else {
      analysis = analyzePrompt(prompt, context.conversationHistory);
    }

    const candidates = this.getCandidates(analysis, context);

    if (candidates.length === 0) {
      const fallback = this.registry.get(this.config.fallbackModel);
      if (!fallback) {
        throw new Error(
          `No suitable models found and fallback model '${this.config.fallbackModel}' not registered`
        );
      }
      return this.buildDecision(fallback, "fallback — no candidates matched", 0, [], analysis, "fallback");
    }

    if (this.config.enableMetaRouting && this.metaRouter && analysis.complexity === "complex") {
      try {
        const metaDecision = await this.metaRouter.selectModel(analysis, candidates, context);
        this.routingLog.push(metaDecision);
        return metaDecision;
      } catch (err) {
        console.warn("[SmartRouter] Meta-routing failed, falling back to scoring:", err);
      }
    }

    const scored = scoreModels(
      analysis,
      candidates,
      this.strategies,
      this.config.strategies,
      context
    );

    const best = scored[0];
    const alternatives = scored.slice(1, 4).map((s) => ({
      model: s.model,
      score: s.totalScore,
    }));

    const decision = this.buildDecision(
      best.model,
      this.explainDecision(analysis, best, classificationResults),
      best.totalScore,
      alternatives,
      analysis,
      "weighted-scoring"
    );

    this.routingLog.push(decision);

    if (this.config.logging) {
      this.logDecision(decision, analysis);
    }

    return decision;
  }

  private getCandidates(analysis: PromptAnalysis, context?: RoutingContext): ModelProfile[] {
    let candidates = this.registry.getEnabled();

    if (analysis.requiresVision) {
      candidates = candidates.filter((m) => m.capabilities.includes("vision"));
    }

    candidates = candidates.filter(
      (m) => m.contextWindow >= analysis.estimatedInputTokens + analysis.estimatedOutputTokens
    );

    if (context?.userPreferences) {
      const prefs = context.userPreferences;
      if (prefs.blockedModels?.length) {
        candidates = candidates.filter((m) => !prefs.blockedModels!.includes(m.id));
      }
      if (prefs.preferredProviders?.length) {
        const preferred = candidates.filter((m) =>
          prefs.preferredProviders!.includes(m.provider)
        );
        if (preferred.length > 0) candidates = preferred;
      }
      if (prefs.preferredTier) {
        const tierMatch = candidates.filter((m) => m.tier === prefs.preferredTier);
        if (tierMatch.length > 0) candidates = tierMatch;
      }
    }

    return candidates;
  }

  private buildDecision(
    model: ModelProfile,
    reason: string,
    score: number,
    alternatives: Array<{ model: ModelProfile; score: number }>,
    analysis: PromptAnalysis,
    strategy: string
  ): RoutingDecision {
    return {
      selectedModel: model,
      reason,
      score,
      alternativeModels: alternatives,
      estimatedCost: estimateCost(analysis, model),
      strategy,
      timestamp: Date.now(),
    };
  }

  private explainDecision(
    analysis: PromptAnalysis,
    best: { model: ModelProfile; totalScore: number; strategyScores: Record<string, number> },
    classifications?: ClassificationResult[]
  ): string {
    const parts: string[] = [];

    if (classifications && classifications.length > 0) {
      parts.push(`Classification: ${classifications[0].name} (${classifications[0].confidence.toFixed(2)})`);
    }

    parts.push(`Complexity: ${analysis.complexity}`);
    parts.push(`Capabilities: [${analysis.detectedCapabilities.join(", ")}]`);
    parts.push(`Model tier: ${best.model.tier}`);

    const topStrategy = Object.entries(best.strategyScores)
      .sort(([, a], [, b]) => b - a)[0];
    if (topStrategy) {
      parts.push(`Top strategy: ${topStrategy[0]} (${topStrategy[1].toFixed(2)})`);
    }

    return parts.join(" | ");
  }

  private logDecision(decision: RoutingDecision, analysis: PromptAnalysis): void {
    console.log(
      `[SmartRouter] Selected: ${decision.selectedModel.id} | ` +
      `Score: ${decision.score.toFixed(3)} | ` +
      `Strategy: ${decision.strategy} | ` +
      `Cost: $${decision.estimatedCost.toFixed(6)} | ` +
      `Complexity: ${analysis.complexity}`
    );
  }

  getRoutingLog(): RoutingDecision[] {
    return [...this.routingLog];
  }

  getRegistry(): ModelRegistry {
    return this.registry;
  }

  addStrategy(strategy: RoutingStrategy, config: { weight: number; params?: Record<string, unknown> }): void {
    this.strategies.push(strategy);
    this.config.strategies.push({
      name: strategy.name,
      weight: config.weight,
      enabled: true,
      params: config.params || {},
    });
  }
}

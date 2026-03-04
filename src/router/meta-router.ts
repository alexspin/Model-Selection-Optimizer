import type {
  PromptAnalysis,
  ModelProfile,
  RoutingContext,
  RoutingDecision,
} from "../types/index.js";

export interface MetaRoutingProvider {
  selectModel(
    prompt: PromptAnalysis,
    candidates: ModelProfile[],
    context: RoutingContext
  ): Promise<RoutingDecision>;
}

export class LLMMetaRouter implements MetaRoutingProvider {
  private metaModelId: string;

  constructor(metaModelId: string) {
    this.metaModelId = metaModelId;
  }

  async selectModel(
    prompt: PromptAnalysis,
    candidates: ModelProfile[],
    context: RoutingContext
  ): Promise<RoutingDecision> {
    const systemPrompt = this.buildSystemPrompt(candidates);
    const userPrompt = this.buildUserPrompt(prompt, context);

    console.log(`[MetaRouter] Would call ${this.metaModelId} for routing decision`);
    console.log(`[MetaRouter] System prompt length: ${systemPrompt.length}`);
    console.log(`[MetaRouter] User prompt length: ${userPrompt.length}`);

    const defaultModel = candidates[0];
    return {
      selectedModel: defaultModel,
      reason: `Meta-routing via ${this.metaModelId} (stub — integrate with OpenClaw provider to enable)`,
      score: 0.9,
      alternativeModels: candidates.slice(1, 4).map((m, i) => ({
        model: m,
        score: 0.8 - i * 0.1,
      })),
      estimatedCost: 0,
      strategy: "meta-llm",
      timestamp: Date.now(),
    };
  }

  private buildSystemPrompt(candidates: ModelProfile[]): string {
    const modelSummaries = candidates
      .map(
        (m) =>
          `- ${m.id}: tier=${m.tier}, capabilities=[${m.capabilities.join(",")}], ` +
          `cost=$${m.pricing.inputPerMillionTokens}/$${m.pricing.outputPerMillionTokens} per M tokens, ` +
          `latency=${m.averageLatencyMs}ms, context=${m.contextWindow}`
      )
      .join("\n");

    return `You are a model routing assistant. Given a user prompt analysis, select the best model.

Available models:
${modelSummaries}

Respond with JSON: {"modelId": "<id>", "reason": "<why>"}
Consider: prompt complexity, required capabilities, cost efficiency, and latency.
Match complexity to model tier — don't use expensive frontier models for simple tasks.`;
  }

  private buildUserPrompt(prompt: PromptAnalysis, context: RoutingContext): string {
    return JSON.stringify({
      complexity: prompt.complexity,
      capabilities: prompt.detectedCapabilities,
      estimatedInputTokens: prompt.estimatedInputTokens,
      estimatedOutputTokens: prompt.estimatedOutputTokens,
      requiresReasoning: prompt.requiresReasoning,
      requiresCodeGen: prompt.requiresCodeGen,
      requiresLongContext: prompt.requiresLongContext,
      conversationDepth: prompt.conversationDepth,
      budget: context.budget,
      preferences: context.userPreferences,
    });
  }
}

import type { ModelProfile, ModelProvider, ModelCapability, ModelTier } from "../types/index.js";
import { loadRoutingConfig } from "../config/routing-config.js";

function loadModelsFromConfig(): ModelProfile[] {
  const config = loadRoutingConfig();
  const models: ModelProfile[] = [];

  if (config.models) {
    for (const [id, entry] of Object.entries(config.models)) {
      models.push({
        id,
        provider: entry.provider as ModelProvider,
        modelId: entry.modelId,
        displayName: entry.displayName,
        tier: entry.tier as ModelTier,
        capabilities: entry.capabilities as ModelCapability[],
        contextWindow: entry.contextWindow,
        maxOutputTokens: entry.maxOutputTokens,
        pricing: entry.pricing,
        averageLatencyMs: entry.averageLatencyMs,
        qualityScores: entry.qualityScores as Record<ModelCapability, number>,
        isLocal: entry.isLocal ?? false,
        enabled: entry.enabled ?? true,
      });
    }
  }

  return models;
}

export class ModelRegistry {
  private models: Map<string, ModelProfile> = new Map();

  constructor() {
    for (const model of loadModelsFromConfig()) {
      this.models.set(model.id, model);
    }
  }

  register(model: ModelProfile): void {
    this.models.set(model.id, model);
  }

  unregister(modelId: string): boolean {
    return this.models.delete(modelId);
  }

  get(modelId: string): ModelProfile | undefined {
    return this.models.get(modelId);
  }

  getEnabled(): ModelProfile[] {
    return Array.from(this.models.values()).filter((m) => m.enabled);
  }

  getByProvider(provider: ModelProvider): ModelProfile[] {
    return this.getEnabled().filter((m) => m.provider === provider);
  }

  getByTier(tier: ModelTier): ModelProfile[] {
    return this.getEnabled().filter((m) => m.tier === tier);
  }

  getByCapability(capability: ModelCapability): ModelProfile[] {
    return this.getEnabled().filter((m) => m.capabilities.includes(capability));
  }

  getLocalModels(): ModelProfile[] {
    return this.getEnabled().filter((m) => m.isLocal);
  }

  getCloudModels(): ModelProfile[] {
    return this.getEnabled().filter((m) => !m.isLocal);
  }

  listAll(): ModelProfile[] {
    return Array.from(this.models.values());
  }

  enable(modelId: string): void {
    const model = this.models.get(modelId);
    if (model) model.enabled = true;
  }

  disable(modelId: string): void {
    const model = this.models.get(modelId);
    if (model) model.enabled = false;
  }

  updateQualityScore(modelId: string, capability: ModelCapability, score: number): void {
    const model = this.models.get(modelId);
    if (model) {
      model.qualityScores[capability] = Math.max(0, Math.min(1, score));
    }
  }

  updateLatency(modelId: string, latencyMs: number): void {
    const model = this.models.get(modelId);
    if (model) {
      model.averageLatencyMs = model.averageLatencyMs * 0.8 + latencyMs * 0.2;
    }
  }
}

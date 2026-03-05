import type { ModelProfile, ModelProvider, ModelCapability, ModelTier } from "../types/index.js";

const builtInModels: ModelProfile[] = [
  {
    id: "anthropic/claude-opus-4-6",
    provider: "anthropic",
    modelId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    tier: "frontier",
    capabilities: [
      "text-generation", "code-generation", "reasoning",
      "summarization", "creative-writing", "data-analysis",
      "function-calling", "long-context",
    ],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    pricing: { inputPerMillionTokens: 15, outputPerMillionTokens: 75, cacheReadPerMillionTokens: 1.5, cacheWritePerMillionTokens: 18.75 },
    averageLatencyMs: 3000,
    qualityScores: {
      "text-generation": 0.97, "code-generation": 0.98, "reasoning": 0.99,
      "summarization": 0.96, "translation": 0.92, "creative-writing": 0.97,
      "data-analysis": 0.95, "function-calling": 0.96, "vision": 0.0, "long-context": 0.97,
    },
    isLocal: false,
    enabled: true,
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    tier: "mid",
    capabilities: [
      "text-generation", "code-generation", "reasoning",
      "summarization", "creative-writing", "data-analysis",
      "function-calling", "long-context",
    ],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    pricing: { inputPerMillionTokens: 3, outputPerMillionTokens: 15, cacheReadPerMillionTokens: 0.3, cacheWritePerMillionTokens: 3.75 },
    averageLatencyMs: 1500,
    qualityScores: {
      "text-generation": 0.93, "code-generation": 0.94, "reasoning": 0.92,
      "summarization": 0.93, "translation": 0.90, "creative-writing": 0.92,
      "data-analysis": 0.91, "function-calling": 0.93, "vision": 0.0, "long-context": 0.93,
    },
    isLocal: false,
    enabled: true,
  },
  {
    id: "google/gemini-2.5-pro",
    provider: "google",
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    tier: "frontier",
    capabilities: [
      "text-generation", "code-generation", "reasoning",
      "summarization", "creative-writing", "data-analysis",
      "function-calling", "vision", "long-context",
    ],
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    pricing: { inputPerMillionTokens: 1.25, outputPerMillionTokens: 10 },
    averageLatencyMs: 2500,
    qualityScores: {
      "text-generation": 0.93, "code-generation": 0.94, "reasoning": 0.95,
      "summarization": 0.92, "translation": 0.93, "creative-writing": 0.88,
      "data-analysis": 0.93, "function-calling": 0.90, "vision": 0.93, "long-context": 0.96,
    },
    isLocal: false,
    enabled: true,
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "google",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    tier: "budget",
    capabilities: [
      "text-generation", "code-generation", "reasoning",
      "summarization", "function-calling", "vision",
    ],
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    pricing: { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6 },
    averageLatencyMs: 400,
    qualityScores: {
      "text-generation": 0.84, "code-generation": 0.83, "reasoning": 0.80,
      "summarization": 0.83, "translation": 0.82, "creative-writing": 0.78,
      "data-analysis": 0.80, "function-calling": 0.82, "vision": 0.82, "long-context": 0.90,
    },
    isLocal: false,
    enabled: true,
  },
  {
    id: "ollama/qwen3:8b",
    provider: "ollama",
    modelId: "qwen3:8b",
    displayName: "Qwen3 8B (Local)",
    tier: "local",
    capabilities: [
      "text-generation", "code-generation", "reasoning", "summarization",
    ],
    contextWindow: 32768,
    maxOutputTokens: 8192,
    pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
    averageLatencyMs: 1200,
    qualityScores: {
      "text-generation": 0.75, "code-generation": 0.72, "reasoning": 0.68,
      "summarization": 0.74, "translation": 0.70, "creative-writing": 0.65,
      "data-analysis": 0.62, "function-calling": 0.55, "vision": 0.0, "long-context": 0.60,
    },
    isLocal: true,
    enabled: false,
  },
];

export class ModelRegistry {
  private models: Map<string, ModelProfile> = new Map();

  constructor() {
    for (const model of builtInModels) {
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

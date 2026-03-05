import { SmartRouter } from "../router/router.js";
import { SemanticClassifier } from "../analyzers/semantic-classifier.js";
import { ModelRegistry } from "../models/registry.js";
import { defaultRouterConfig, createRouterConfig } from "../config/defaults.js";
import { defaultClassifications } from "../config/classifications.js";
import type { RoutingContext, RoutingDecision, UserPreferences, ModelProvider, ModelTier } from "../types/index.js";

export interface SmartRouterPluginConfig {
  enabled: boolean;
  fallbackModel: string;
  initTimeoutMs: number;
  routeTimeoutMs: number;
  logDecisions: boolean;
  strategyWeights?: Record<string, number>;
  blockedModels?: string[];
  preferredProviders?: string[];
  preferredTier?: string;
}

export const DEFAULT_PLUGIN_CONFIG: SmartRouterPluginConfig = {
  enabled: true,
  fallbackModel: "anthropic/claude-sonnet-4-6",
  initTimeoutMs: 30000,
  routeTimeoutMs: 5000,
  logDecisions: true,
};

export interface BridgeLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface ResolveResult {
  modelOverride: string;
  providerOverride: string;
  decision: RoutingDecision;
  strippedPrompt?: string;
}

const ROUTE_PREFIXES: Record<string, ModelTier> = {
  "/simple": "budget",
  "/quick": "budget",
  "/cheap": "budget",
  "/coding": "mid",
  "/code": "mid",
  "/creative": "mid",
  "/write": "mid",
  "/action": "mid",
  "/do": "mid",
  "/reason": "frontier",
  "/think": "frontier",
  "/best": "frontier",
};

export function parseRoutePrefix(prompt: string): { tier: ModelTier; stripped: string } | null {
  const trimmed = prompt.trimStart();
  for (const [prefix, tier] of Object.entries(ROUTE_PREFIXES)) {
    if (trimmed.toLowerCase().startsWith(prefix + " ") || trimmed.toLowerCase() === prefix) {
      const stripped = trimmed.slice(prefix.length).trim();
      return { tier, stripped: stripped || trimmed };
    }
  }
  return null;
}

export class SmartRouterBridge {
  private router: SmartRouter | null = null;
  private classifier: SemanticClassifier | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private initFailed = false;

  constructor(
    private config: SmartRouterPluginConfig = DEFAULT_PLUGIN_CONFIG,
    private logger?: BridgeLogger
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.logger?.info?.("smart-router: initializing semantic classifier...");

      this.classifier = new SemanticClassifier(defaultClassifications);
      await this.classifier.initialize();

      const routerConfig = createRouterConfig({
        fallbackModel: this.config.fallbackModel,
      });
      if (this.config.strategyWeights) {
        for (const strategy of routerConfig.strategies) {
          if (this.config.strategyWeights[strategy.name] !== undefined) {
            strategy.weight = this.config.strategyWeights[strategy.name];
          }
        }
      }

      const registry = new ModelRegistry();
      this.router = new SmartRouter(routerConfig, registry);
      this.router.setSemanticClassifier(this.classifier);

      this.initialized = true;
      this.initFailed = false;
      this.logger?.info?.("smart-router: initialized successfully");
    } catch (err) {
      this.initFailed = true;
      this.initPromise = null;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.error?.(`smart-router: initialization failed: ${msg}`);
      throw err;
    }
  }

  async resolveModel(
    prompt: string,
    hookContext?: { agentId?: string; sessionKey?: string; sessionId?: string; channelId?: string }
  ): Promise<ResolveResult | null> {
    if (!this.config.enabled) return null;

    const prefixMatch = parseRoutePrefix(prompt);
    if (prefixMatch) {
      return this.resolveByTier(prefixMatch.tier, prefixMatch.stripped, hookContext);
    }

    try {
      const initTimeout = this.config.initTimeoutMs;
      await Promise.race([
        this.initialize(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("init timeout")), initTimeout)
        ),
      ]);
    } catch {
      this.logger?.warn?.("smart-router: skipping route (init failed or timed out)");
      return null;
    }

    if (!this.router) return null;

    try {
      const routingContext = this.buildRoutingContext(prompt, hookContext);

      const decision = await Promise.race([
        this.router.route(prompt, routingContext),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("route timeout")), this.config.routeTimeoutMs)
        ),
      ]);

      const provider = decision.selectedModel.provider;
      const modelName = decision.selectedModel.modelId;

      if (this.config.logDecisions) {
        this.logger?.info?.(
          `smart-router: routed to ${provider}/${modelName} (score=${decision.score.toFixed(3)}, reason=${decision.reason})` +
            (hookContext?.sessionKey ? ` session=${hookContext.sessionKey}` : "")
        );
      }

      return {
        modelOverride: modelName,
        providerOverride: provider,
        decision,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn?.(`smart-router: routing failed, falling back to default: ${msg}`);
      return null;
    }
  }

  private async resolveByTier(
    tier: ModelTier,
    strippedPrompt: string,
    hookContext?: { agentId?: string; sessionKey?: string; sessionId?: string; channelId?: string }
  ): Promise<ResolveResult | null> {
    try {
      await Promise.race([
        this.initialize(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("init timeout")), this.config.initTimeoutMs)
        ),
      ]);
    } catch {
      this.logger?.warn?.("smart-router: skipping forced route (init failed)");
      return null;
    }

    if (!this.router) return null;

    const registry = this.router.getRegistry();
    const tierModels = registry.getByTier(tier);

    if (tierModels.length === 0) {
      this.logger?.warn?.(`smart-router: no models available for forced tier '${tier}'`);
      return null;
    }

    const model = tierModels[0];
    const provider = model.provider;
    const modelName = model.modelId;

    this.logger?.info?.(
      `smart-router: forced route to ${provider}/${modelName} (tier=${tier}, prefix command)` +
        (hookContext?.sessionKey ? ` session=${hookContext.sessionKey}` : "")
    );

    const decision: RoutingDecision = {
      selectedModel: model,
      reason: `Forced route via slash command (tier: ${tier})`,
      score: 1.0,
      alternativeModels: [],
      estimatedCost: 0,
      strategy: "forced-prefix",
      timestamp: Date.now(),
    };

    return {
      modelOverride: modelName,
      providerOverride: provider,
      decision,
      strippedPrompt,
    };
  }

  private buildRoutingContext(
    _prompt: string,
    hookContext?: { agentId?: string; sessionKey?: string; sessionId?: string; channelId?: string }
  ): RoutingContext {
    const userPreferences: UserPreferences = {};

    if (this.config.blockedModels?.length) {
      userPreferences.blockedModels = this.config.blockedModels;
    }
    if (this.config.preferredProviders?.length) {
      userPreferences.preferredProviders = this.config.preferredProviders as ModelProvider[];
    }
    if (this.config.preferredTier) {
      userPreferences.preferredTier = this.config.preferredTier as ModelTier;
    }

    return {
      conversationHistory: [],
      userPreferences,
      sessionId: hookContext?.sessionId ?? hookContext?.sessionKey ?? "unknown",
    };
  }

  getRouter(): SmartRouter | null {
    return this.router;
  }

  getClassifier(): SemanticClassifier | null {
    return this.classifier;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  updateConfig(partial: Partial<SmartRouterPluginConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

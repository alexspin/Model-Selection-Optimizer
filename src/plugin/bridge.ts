import { SmartRouter } from "../router/router.js";
import { SemanticClassifier } from "../analyzers/semantic-classifier.js";
import { ModelRegistry } from "../models/registry.js";
import { createRouterConfig } from "../config/defaults.js";
import { defaultClassifications } from "../config/classifications.js";
import { loadRoutingConfig, getModelForClass, getFallbackModel } from "../config/routing-config.js";
import type { RoutingContext, RoutingDecision, UserPreferences, ModelProvider, ModelTier } from "../types/index.js";

export interface SmartRouterPluginConfig {
  enabled: boolean;
  fallbackModel: string;
  initTimeoutMs: number;
  routeTimeoutMs: number;
  logDecisions: boolean;
  classificationThreshold: number;
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
  classificationThreshold: 0.35,
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

interface MessageIntent {
  cleanText: string;
  className?: string;
  strippedPrompt?: string;
  timestamp: number;
}

const INTENT_TTL_MS = 30_000;

const OPENCLAW_PROMPT_WRAPPER = /^\[.*?\]\s*/;

export type PrefixParseResult =
  | { match: "routed"; className: string; stripped: string }
  | { match: "bare-command" }
  | null;

export function parseRoutePrefix(text: string): PrefixParseResult {
  const config = loadRoutingConfig();
  const lower = text.toLowerCase();

  for (const [command, cmdConfig] of Object.entries(config.commands)) {
    const name = command.replace(/^\//, "");
    const prefixes = [`/${name}`, `~${name}`];
    for (const prefix of prefixes) {
      if (lower === prefix) {
        return { match: "bare-command" };
      }
      if (lower.startsWith(prefix + " ")) {
        const stripped = text.slice(prefix.length).trim();
        if (stripped) {
          return { match: "routed", className: cmdConfig.class, stripped };
        }
        return { match: "bare-command" };
      }
    }
  }
  return null;
}

export class SmartRouterBridge {
  private router: SmartRouter | null = null;
  private classifier: SemanticClassifier | null = null;
  private registry: ModelRegistry | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private pendingMessage: MessageIntent | null = null;

  constructor(
    private config: SmartRouterPluginConfig = DEFAULT_PLUGIN_CONFIG,
    private logger?: BridgeLogger
  ) {}

  storeMessage(cleanText: string, className?: string, strippedPrompt?: string): void {
    this.pendingMessage = {
      cleanText,
      className,
      strippedPrompt,
      timestamp: Date.now(),
    };
  }

  consumePendingMessage(): MessageIntent | null {
    const msg = this.pendingMessage;
    this.pendingMessage = null;
    if (!msg) return null;
    if (Date.now() - msg.timestamp > INTENT_TTL_MS) return null;
    return msg;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.logger?.info?.("smart-router: initializing semantic classifier...");

      this.classifier = new SemanticClassifier(defaultClassifications, {
        confidenceThreshold: this.config.classificationThreshold,
      });
      await this.classifier.initialize();

      const fallback = this.config.fallbackModel || getFallbackModel();
      const routerConfig = createRouterConfig({
        fallbackModel: fallback,
        classificationThreshold: this.config.classificationThreshold,
      });
      if (this.config.strategyWeights) {
        for (const strategy of routerConfig.strategies) {
          if (this.config.strategyWeights[strategy.name] !== undefined) {
            strategy.weight = this.config.strategyWeights[strategy.name];
          }
        }
      }

      this.registry = new ModelRegistry();
      this.router = new SmartRouter(routerConfig, this.registry);
      this.router.setSemanticClassifier(this.classifier);

      this.initialized = true;
      this.logger?.info?.("smart-router: initialized successfully");
    } catch (err) {
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

    const sessionKey = hookContext?.sessionKey ?? hookContext?.sessionId ?? "unknown";

    const pending = this.consumePendingMessage();

    if (pending?.className && pending.strippedPrompt) {
      this.logger?.info?.(`smart-router: command route class=${pending.className} text="${pending.strippedPrompt.substring(0, 80)}" session=${sessionKey}`);
      return this.resolveByClass(pending.className, pending.strippedPrompt, hookContext);
    }

    const cleanText = pending?.cleanText
      ?? prompt?.replace(OPENCLAW_PROMPT_WRAPPER, "").trim()
      ?? null;

    if (cleanText) {
      const source = pending ? "message_received" : "event.prompt";
      this.logger?.info?.(`smart-router: routing text (${source}): "${cleanText.substring(0, 120)}" session=${sessionKey}`);

      const prefixResult = parseRoutePrefix(cleanText);
      if (prefixResult?.match === "routed") {
        return this.resolveByClass(prefixResult.className, prefixResult.stripped, hookContext);
      }
      if (prefixResult?.match === "bare-command") {
        return null;
      }
    }

    const textToRoute = cleanText;
    if (!textToRoute) return null;

    try {
      await Promise.race([
        this.initialize(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("init timeout")), this.config.initTimeoutMs)
        ),
      ]);
    } catch {
      this.logger?.warn?.("smart-router: skipping route (init failed or timed out)");
      return null;
    }

    if (!this.router || !this.registry) return null;

    try {
      const routingContext = this.buildRoutingContext(textToRoute, hookContext);

      const decision = await Promise.race([
        this.router.route(textToRoute, routingContext),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("route timeout")), this.config.routeTimeoutMs)
        ),
      ]);

      const classifiedName = decision.classificationName;
      if (classifiedName) {
        const configModel = getModelForClass(classifiedName);
        if (configModel) {
          const profile = this.registry.get(configModel);
          if (profile) {
            const provider = profile.provider;
            const modelName = profile.modelId;

            if (this.config.logDecisions) {
              this.logger?.info?.(
                `smart-router: routed to ${provider}/${modelName} (class=${classifiedName}, classified)` +
                  ` session=${sessionKey}`
              );
            }

            return {
              modelOverride: modelName,
              providerOverride: provider,
              decision: {
                ...decision,
                selectedModel: profile,
                reason: `Classification: ${classifiedName} → config model: ${configModel}`,
              },
            };
          }
        }
      }

      const provider = decision.selectedModel.provider;
      const modelName = decision.selectedModel.modelId;

      if (this.config.logDecisions) {
        this.logger?.info?.(
          `smart-router: routed to ${provider}/${modelName} (score=${decision.score.toFixed(3)}, scorer-picked)` +
            ` session=${sessionKey}`
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

  async resolveByClass(
    className: string,
    strippedPrompt: string,
    hookContext?: { agentId?: string; sessionKey?: string; sessionId?: string; channelId?: string }
  ): Promise<ResolveResult | null> {
    const configModel = getModelForClass(className);
    if (!configModel) {
      this.logger?.warn?.(`smart-router: unknown class '${className}' from command`);
      return null;
    }

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

    if (!this.registry) return null;

    const profile = this.registry.get(configModel);
    if (!profile) {
      this.logger?.warn?.(`smart-router: model '${configModel}' for class '${className}' not found in registry`);
      return null;
    }

    const provider = profile.provider;
    const modelName = profile.modelId;

    this.logger?.info?.(
      `smart-router: forced route to ${provider}/${modelName} (class=${className}, command)` +
        (hookContext?.sessionKey ? ` session=${hookContext.sessionKey}` : "")
    );

    const decision: RoutingDecision = {
      selectedModel: profile,
      reason: `Forced route via /${className} command → ${configModel}`,
      score: 1.0,
      alternativeModels: [],
      estimatedCost: 0,
      strategy: "forced-command",
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

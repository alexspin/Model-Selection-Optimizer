import { SmartRouter } from "../router/router.js";
import { SemanticClassifier } from "../analyzers/semantic-classifier.js";
import { ModelRegistry } from "../models/registry.js";
import { createRouterConfig } from "../config/defaults.js";
import { defaultClassifications } from "../config/classifications.js";
import { loadRoutingConfig, getModelForClass, getClassForCommand, getFallbackModel } from "../config/routing-config.js";
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

interface RouteIntent {
  className: string;
  strippedPrompt: string;
  timestamp: number;
}

const INTENT_TTL_MS = 30_000;

function stripTimestampPrefix(text: string): string {
  return text.replace(/^\[.*?\]\s*/, "");
}

function extractUserMessage(prompt: string): string {
  let msg = prompt;

  const senderBlockEnd = prompt.indexOf("\n```\n", prompt.indexOf("```json"));
  if (senderBlockEnd !== -1) {
    msg = prompt.slice(senderBlockEnd + 5).trim();
  } else {
    const lastNewlineBlock = prompt.lastIndexOf("\n\n");
    if (lastNewlineBlock !== -1 && prompt.startsWith("Sender")) {
      msg = prompt.slice(lastNewlineBlock).trim();
    }
  }

  msg = stripTimestampPrefix(msg);

  return msg;
}

export function parseRoutePrefix(prompt: string): { className: string; stripped: string } | null {
  const config = loadRoutingConfig();
  const userMsg = extractUserMessage(prompt);
  const lower = userMsg.toLowerCase();

  for (const [command, cmdConfig] of Object.entries(config.commands)) {
    const name = command.replace(/^\//, "");
    const prefixes = [`/${name}`, `~${name}`];
    for (const prefix of prefixes) {
      if (lower === prefix) {
        return null;
      }
      if (lower.startsWith(prefix + " ")) {
        const stripped = userMsg.slice(prefix.length).trim();
        if (stripped) {
          return { className: cmdConfig.class, stripped };
        }
        return null;
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
  private initFailed = false;
  private routeIntents = new Map<string, RouteIntent>();
  private lastIntent: { intent: RouteIntent; sourceKey: string; timestamp: number } | null = null;

  constructor(
    private config: SmartRouterPluginConfig = DEFAULT_PLUGIN_CONFIG,
    private logger?: BridgeLogger
  ) {}

  setRouteIntent(key: string, className: string, strippedPrompt: string): void {
    this.purgeStaleIntents();
    const intent: RouteIntent = {
      className,
      strippedPrompt,
      timestamp: Date.now(),
    };
    this.routeIntents.set(key, intent);
    this.lastIntent = { intent, sourceKey: key, timestamp: Date.now() };
  }

  private static extractChannelAndPeer(key: string): { channel: string; peerId: string } | null {
    const parts = key.split(":").filter(Boolean);
    if (parts.length < 2) return null;

    if (parts[0] === "agent" && parts.length >= 4) {
      return { channel: parts[2], peerId: parts[parts.length - 1] };
    }

    return { channel: parts[0], peerId: parts[parts.length - 1] };
  }

  consumeRouteIntent(sessionKey: string): RouteIntent | null {
    const intent = this.routeIntents.get(sessionKey);
    if (intent) {
      this.routeIntents.delete(sessionKey);
      if (Date.now() - intent.timestamp > INTENT_TTL_MS) return null;
      return intent;
    }

    const now = Date.now();
    const session = SmartRouterBridge.extractChannelAndPeer(sessionKey);
    if (!session) return null;

    for (const [key, candidate] of this.routeIntents) {
      if (now - candidate.timestamp > INTENT_TTL_MS) {
        this.routeIntents.delete(key);
        continue;
      }

      const stored = SmartRouterBridge.extractChannelAndPeer(key);
      if (!stored) continue;

      if (session.channel === stored.channel && session.peerId === stored.peerId) {
        this.routeIntents.delete(key);
        this.lastIntent = null;
        return candidate;
      }
    }

    if (this.lastIntent && Date.now() - this.lastIntent.timestamp < 5_000) {
      const intent = this.lastIntent.intent;
      const sourceKey = this.lastIntent.sourceKey;
      this.routeIntents.delete(sourceKey);
      this.lastIntent = null;
      if (Date.now() - intent.timestamp > INTENT_TTL_MS) return null;
      this.logger?.info?.(`smart-router: matched intent via recency fallback (stored=${sourceKey}, lookup=${sessionKey})`);
      return intent;
    }
    this.lastIntent = null;
    return null;
  }

  private purgeStaleIntents(): void {
    const now = Date.now();
    for (const [key, intent] of this.routeIntents) {
      if (now - intent.timestamp > INTENT_TTL_MS) {
        this.routeIntents.delete(key);
      }
    }
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

    const sessionKey = hookContext?.sessionKey ?? hookContext?.sessionId ?? "unknown";

    const storedIntent = this.consumeRouteIntent(sessionKey);
    if (storedIntent) {
      this.logger?.info?.(`smart-router: found stored intent class=${storedIntent.className} for session=${sessionKey}`);
      return this.resolveByClass(storedIntent.className, storedIntent.strippedPrompt, hookContext);
    }

    const userMsg = extractUserMessage(prompt);
    this.logger?.info?.(`smart-router: resolving prompt: "${userMsg.substring(0, 120)}"`);
    this.logger?.debug?.(`smart-router: extractUserMessage raw result (first 200): "${userMsg.substring(0, 200)}"`);

    const prefixMatch = parseRoutePrefix(prompt);
    if (prefixMatch) {
      return this.resolveByClass(prefixMatch.className, prefixMatch.stripped, hookContext);
    }

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
      const routingContext = this.buildRoutingContext(userMsg, hookContext);

      const decision = await Promise.race([
        this.router.route(userMsg, routingContext),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("route timeout")), this.config.routeTimeoutMs)
        ),
      ]);

      const classifiedName = this.extractClassFromDecision(decision);
      if (classifiedName) {
        const configModel = getModelForClass(classifiedName);
        if (configModel) {
          const profile = this.registry.get(configModel);
          if (profile) {
            const provider = profile.provider;
            const modelName = profile.modelId;

            if (this.config.logDecisions) {
              this.logger?.info?.(
                `smart-router: routed to ${provider}/${modelName} (class=${classifiedName}, config-mapped)` +
                  (hookContext?.sessionKey ? ` session=${hookContext.sessionKey}` : "")
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

  private extractClassFromDecision(decision: RoutingDecision): string | null {
    const match = decision.reason.match(/^Classification:\s*(\w+)/);
    return match ? match[1] : null;
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

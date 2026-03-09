import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export interface ClassConfig {
  description: string;
  model: string;
  examples: string;
  capabilities: string[];
  outputScale: "short" | "medium" | "long";
}

export interface CommandConfig {
  class: string;
  helpText: string;
}

export interface ModelEntry {
  provider: string;
  modelId: string;
  displayName: string;
  tier: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  pricing: {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
    cacheReadPerMillionTokens?: number;
    cacheWritePerMillionTokens?: number;
  };
  averageLatencyMs: number;
  qualityScores: Record<string, number>;
  isLocal?: boolean;
  enabled?: boolean;
}

export interface RoutingConfig {
  models?: Record<string, ModelEntry>;
  commands: Record<string, CommandConfig>;
  classes: Record<string, ClassConfig>;
  fallbackClass: string;
}

const BUILTIN_CONFIG: RoutingConfig = {
  models: {
    "anthropic/claude-sonnet-4-6": {
      provider: "anthropic", modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", tier: "mid",
      capabilities: ["text-generation", "code-generation", "reasoning", "summarization", "creative-writing", "data-analysis", "function-calling", "long-context"],
      contextWindow: 200000, maxOutputTokens: 8192,
      pricing: { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      averageLatencyMs: 1500,
      qualityScores: { "text-generation": 0.93, "code-generation": 0.94, "reasoning": 0.92, "summarization": 0.93, "translation": 0.90, "creative-writing": 0.92, "data-analysis": 0.91, "function-calling": 0.93, "vision": 0.0, "long-context": 0.93 },
      isLocal: false, enabled: true,
    },
    "google/gemini-2.5-flash": {
      provider: "google", modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", tier: "budget",
      capabilities: ["text-generation", "code-generation", "reasoning", "summarization", "function-calling", "vision"],
      contextWindow: 1000000, maxOutputTokens: 65536,
      pricing: { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6 },
      averageLatencyMs: 400,
      qualityScores: { "text-generation": 0.84, "code-generation": 0.83, "reasoning": 0.80, "summarization": 0.83, "translation": 0.82, "creative-writing": 0.78, "data-analysis": 0.80, "function-calling": 0.82, "vision": 0.82, "long-context": 0.90 },
      isLocal: false, enabled: true,
    },
  },
  commands: {
    "/simple": { class: "simple", helpText: "Simple/Budget routing — Routes to budget model.\nUsage: /simple <your message>" },
    "/cheap": { class: "simple", helpText: "Budget routing — Alias for /simple.\nUsage: /cheap <your message>" },
    "/coding": { class: "coding", helpText: "Code routing — Routes to coding-optimized model.\nUsage: /coding <your message>" },
    "/creative": { class: "creative", helpText: "Creative routing — Routes to creative writing model.\nUsage: /creative <your message>" },
    "/action": { class: "action", helpText: "Action routing — Routes to tool-calling model.\nUsage: /action <your message>" },
    "/reason": { class: "reasoning", helpText: "Reasoning routing — Routes to frontier reasoning model.\nUsage: /reason <your message>" },
    "/best": { class: "reasoning", helpText: "Best model routing — Alias for /reason.\nUsage: /best <your message>" },
  },
  classes: {
    simple: {
      description: "Quick facts, follow-ups, casual chat",
      model: "google/gemini-2.5-flash",
      examples: "simple.json",
      capabilities: ["text-generation"],
      outputScale: "short",
    },
    coding: {
      description: "Writing code, debugging, refactoring",
      model: "anthropic/claude-sonnet-4-6",
      examples: "coding.json",
      capabilities: ["code-generation"],
      outputScale: "long",
    },
    reasoning: {
      description: "Deep analysis, architecture, trade-offs",
      model: "google/gemini-2.5-pro",
      examples: "reasoning.json",
      capabilities: ["reasoning"],
      outputScale: "long",
    },
    creative: {
      description: "Blog posts, emails, translation, copy",
      model: "anthropic/claude-sonnet-4-6",
      examples: "creative.json",
      capabilities: ["creative-writing"],
      outputScale: "long",
    },
    action: {
      description: "Tool calls, file ops, data queries",
      model: "anthropic/claude-sonnet-4-6",
      examples: "action.json",
      capabilities: ["function-calling"],
      outputScale: "short",
    },
  },
  fallbackClass: "simple",
};

let cached: RoutingConfig | null = null;

export function loadRoutingConfig(): RoutingConfig {
  if (cached) return cached;

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const configPath = join(__dirname, "routing.json");

    if (!existsSync(configPath)) {
      console.warn("[routing-config] routing.json not found, using built-in defaults");
      cached = BUILTIN_CONFIG;
      return cached;
    }

    cached = JSON.parse(readFileSync(configPath, "utf-8")) as RoutingConfig;
    return cached;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[routing-config] failed to load routing.json, using built-in defaults: ${msg}`);
    cached = BUILTIN_CONFIG;
    return cached;
  }
}

export function getModelForClass(className: string): string | null {
  const config = loadRoutingConfig();
  return config.classes[className]?.model ?? null;
}

export function getClassForCommand(command: string): string | null {
  const config = loadRoutingConfig();
  return config.commands[command]?.class ?? null;
}

export function getHelpForCommand(command: string): string | null {
  const config = loadRoutingConfig();
  return config.commands[command]?.helpText ?? null;
}

export function getFallbackModel(): string {
  const config = loadRoutingConfig();
  const fallbackClass = config.fallbackClass;
  return config.classes[fallbackClass]?.model ?? "anthropic/claude-sonnet-4-6";
}

export function getFallbackClass(): string {
  const config = loadRoutingConfig();
  return config.fallbackClass;
}

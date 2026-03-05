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

export interface RoutingConfig {
  commands: Record<string, string>;
  classes: Record<string, ClassConfig>;
  fallbackClass: string;
}

const BUILTIN_CONFIG: RoutingConfig = {
  commands: {
    "/simple": "simple",
    "/cheap": "simple",
    "/coding": "coding",
    "/creative": "creative",
    "/action": "action",
    "/reason": "reasoning",
    "/best": "reasoning",
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
  return config.commands[command] ?? null;
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

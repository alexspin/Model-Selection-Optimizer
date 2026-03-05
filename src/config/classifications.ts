import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { ModelCapability, ModelTier } from "../types/index.js";
import type { RoutingConfig } from "./routing-config.js";
import { loadRoutingConfig } from "./routing-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLES_DIR = join(__dirname, "examples");

function loadExamples(filename: string): string[] {
  const filePath = join(EXAMPLES_DIR, filename);
  if (!existsSync(filePath)) {
    console.warn(`[classifications] examples file not found: ${filePath}`);
    return [];
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[classifications] failed to load examples from ${filename}: ${msg}`);
    return [];
  }
}

export interface ClassificationDefinition {
  name: string;
  description: string;
  examples: string[];
  suggestedTier: ModelTier;
  requiredCapabilities: ModelCapability[];
  expectedOutputScale: "short" | "medium" | "long";
}

const TIER_FROM_MODEL: Record<string, ModelTier> = {
  "anthropic/claude-opus-4-6": "frontier",
  "anthropic/claude-sonnet-4-6": "mid",
  "google/gemini-2.5-pro": "frontier",
  "google/gemini-2.5-flash": "budget",
  "ollama/qwen3:8b": "local",
};

function inferTier(modelId: string): ModelTier {
  return TIER_FROM_MODEL[modelId] ?? "mid";
}

function buildClassifications(config: RoutingConfig): ClassificationDefinition[] {
  const classifications: ClassificationDefinition[] = [];

  for (const [name, classDef] of Object.entries(config.classes)) {
    const examples = loadExamples(classDef.examples);
    if (examples.length === 0) {
      console.warn(`[classifications] class '${name}' has no examples, skipping`);
      continue;
    }

    classifications.push({
      name,
      description: classDef.description,
      examples,
      suggestedTier: inferTier(classDef.model),
      requiredCapabilities: classDef.capabilities as ModelCapability[],
      expectedOutputScale: classDef.outputScale,
    });
  }

  return classifications;
}

const routingConfig = loadRoutingConfig();
export const defaultClassifications: ClassificationDefinition[] = buildClassifications(routingConfig);

export function loadClassifications(
  custom?: ClassificationDefinition[]
): ClassificationDefinition[] {
  if (custom && custom.length > 0) {
    return custom;
  }
  return defaultClassifications;
}

export function mergeClassifications(
  base: ClassificationDefinition[],
  overrides: ClassificationDefinition[]
): ClassificationDefinition[] {
  const merged = new Map<string, ClassificationDefinition>();
  for (const c of base) {
    merged.set(c.name, c);
  }
  for (const c of overrides) {
    merged.set(c.name, c);
  }
  return Array.from(merged.values());
}

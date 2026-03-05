import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { ModelCapability, ModelTier } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLES_DIR = join(__dirname, "examples");

function loadExamples(filename: string): string[] {
  const filePath = join(EXAMPLES_DIR, filename);
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

export interface ClassificationDefinition {
  name: string;
  description: string;
  examples: string[];
  suggestedTier: ModelTier;
  requiredCapabilities: ModelCapability[];
  expectedOutputScale: "short" | "medium" | "long";
}

export const defaultClassifications: ClassificationDefinition[] = [
  {
    name: "simple",
    description: "Quick facts, follow-ups, casual chat, acknowledgments, short summaries, conversational replies",
    examples: loadExamples("simple.json"),
    suggestedTier: "budget",
    requiredCapabilities: ["text-generation"],
    expectedOutputScale: "short",
  },
  {
    name: "coding",
    description: "Writing code, debugging errors, building features, fixing bugs, refactoring, code review",
    examples: loadExamples("coding.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["code-generation"],
    expectedOutputScale: "long",
  },
  {
    name: "reasoning",
    description: "Multi-step analysis, architecture decisions, trade-off evaluation, complex comparisons, system design",
    examples: loadExamples("reasoning.json"),
    suggestedTier: "frontier",
    requiredCapabilities: ["reasoning"],
    expectedOutputScale: "long",
  },
  {
    name: "creative",
    description: "Writing content, drafting emails, blog posts, marketing copy, translation, localization",
    examples: loadExamples("creative.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["creative-writing"],
    expectedOutputScale: "long",
  },
  {
    name: "action",
    description: "Tool calls, system commands, file operations, data queries, deployments, external service interactions",
    examples: loadExamples("action.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["function-calling"],
    expectedOutputScale: "short",
  },
];

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

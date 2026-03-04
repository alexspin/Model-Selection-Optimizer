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
    name: "simple-question",
    description: "Quick factual answers, conversions, definitions, or basic lookups",
    examples: loadExamples("simple-question.json"),
    suggestedTier: "budget",
    requiredCapabilities: ["text-generation"],
    expectedOutputScale: "short",
  },
  {
    name: "code-generation",
    description: "Writing new code, creating functions, building components or features",
    examples: loadExamples("code-generation.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["code-generation"],
    expectedOutputScale: "long",
  },
  {
    name: "code-debugging",
    description: "Finding and fixing bugs, reading errors, troubleshooting existing code",
    examples: loadExamples("code-debugging.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["code-generation", "reasoning"],
    expectedOutputScale: "medium",
  },
  {
    name: "deep-reasoning",
    description: "Complex multi-step analysis, architecture decisions, trade-off evaluation",
    examples: loadExamples("deep-reasoning.json"),
    suggestedTier: "frontier",
    requiredCapabilities: ["reasoning"],
    expectedOutputScale: "long",
  },
  {
    name: "creative-writing",
    description: "Stories, marketing copy, emails, blog posts, content generation",
    examples: loadExamples("creative-writing.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["creative-writing"],
    expectedOutputScale: "long",
  },
  {
    name: "summarization",
    description: "Condensing long text, extracting key points, creating overviews",
    examples: loadExamples("summarization.json"),
    suggestedTier: "budget",
    requiredCapabilities: ["summarization"],
    expectedOutputScale: "medium",
  },
  {
    name: "data-analysis",
    description: "Working with numbers, tables, statistics, datasets, calculations",
    examples: loadExamples("data-analysis.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["data-analysis"],
    expectedOutputScale: "medium",
  },
  {
    name: "translation",
    description: "Language translation, localization, multilingual tasks",
    examples: loadExamples("translation.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["translation"],
    expectedOutputScale: "medium",
  },
  {
    name: "tool-use",
    description: "Requests that should trigger tools, function calls, or external actions",
    examples: loadExamples("tool-use.json"),
    suggestedTier: "mid",
    requiredCapabilities: ["function-calling"],
    expectedOutputScale: "short",
  },
  {
    name: "conversation",
    description: "Casual chat, follow-ups, acknowledgments, context-dependent replies",
    examples: loadExamples("conversation.json"),
    suggestedTier: "budget",
    requiredCapabilities: ["text-generation"],
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

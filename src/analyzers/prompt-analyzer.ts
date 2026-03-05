import type { PromptAnalysis, ModelCapability, ConversationTurn } from "../types/index.js";
import type { ClassificationResult } from "./semantic-classifier.js";

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function capabilitiesFromClassifications(results: ClassificationResult[]): ModelCapability[] {
  const capabilities: Set<ModelCapability> = new Set();
  capabilities.add("text-generation");
  for (const result of results) {
    for (const cap of result.definition.requiredCapabilities) {
      capabilities.add(cap);
    }
  }
  return Array.from(capabilities);
}

function complexityFromClassifications(
  results: ClassificationResult[],
  tokenCount: number
): "simple" | "moderate" | "complex" {
  if (results.length === 0) return "moderate";

  const topResult = results[0];
  const tier = topResult.definition.suggestedTier;

  if (tier === "frontier" || tokenCount > 2000) return "complex";
  if (tier === "budget" || tier === "local") return "simple";
  if (tier === "mid" || tokenCount > 500) return "moderate";

  return "moderate";
}

function outputEstimateFromClassifications(
  results: ClassificationResult[],
  complexity: "simple" | "moderate" | "complex"
): number {
  if (results.length === 0) {
    return complexity === "complex" ? 2000 : complexity === "moderate" ? 800 : 200;
  }

  const scale = results[0].definition.expectedOutputScale;
  switch (scale) {
    case "short": return 200;
    case "medium": return 800;
    case "long": return 2000;
  }
}

export function analyzePromptWithClassifications(
  prompt: string,
  classificationResults: ClassificationResult[],
  conversationHistory: ConversationTurn[] = []
): PromptAnalysis {
  const capabilities = capabilitiesFromClassifications(classificationResults);
  const totalContextTokens = conversationHistory.reduce(
    (sum, turn) => sum + estimateTokenCount(turn.content), 0
  );
  const estimatedInputTokens = estimateTokenCount(prompt) + totalContextTokens;
  const complexity = complexityFromClassifications(classificationResults, estimatedInputTokens);
  const estimatedOutputTokens = outputEstimateFromClassifications(classificationResults, complexity);

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    detectedCapabilities: capabilities,
    complexity,
    requiresReasoning: capabilities.includes("reasoning"),
    requiresCodeGen: capabilities.includes("code-generation"),
    requiresLongContext: estimatedInputTokens > 50000,
    requiresVision: capabilities.includes("vision"),
    conversationDepth: conversationHistory.length,
    rawPrompt: prompt,
  };
}

const CODE_INDICATORS = [
  /\b(function|class|const|let|var|import|export|return|async|await)\b/,
  /\b(def |class |import |from |print\(|self\.)\b/,
  /[{}\[\]();].*[{}\[\]();]/,
  /\b(write|create|build|implement|code|program|script|debug|fix|refactor)\b/i,
  /\b(api|endpoint|route|handler|middleware|database|query|sql)\b/i,
];

const REASONING_INDICATORS = [
  /\b(explain|why|how|analyze|compare|evaluate|assess|think|reason|consider)\b/i,
  /\b(pros and cons|trade-?offs?|advantages|disadvantages|implications)\b/i,
  /\b(step by step|walk me through|break down|elaborate)\b/i,
  /\b(mathematical|proof|theorem|logic|deduce|infer)\b/i,
];

const CREATIVE_INDICATORS = [
  /\b(compose|draft|imagine|story|poem|essay|narrative)\b/i,
  /\b(creative|artistic|fictional|metaphor|style|tone|voice)\b/i,
];

const SUMMARY_INDICATORS = [
  /\b(summarize|summary|tldr|brief|overview|key points|main ideas|recap)\b/i,
  /\b(condense|shorten|simplify|distill)\b/i,
];

const DATA_INDICATORS = [
  /\b(data|csv|json|table|chart|graph|statistics|dataset|metrics)\b/i,
  /\b(calculate|compute|aggregate|average|median|percentage)\b/i,
];

const TRANSLATION_INDICATORS = [
  /\b(translate|translation|in \w+ language|to \w+ish|to \w+ese|to \w+an)\b/i,
];

const VISION_INDICATORS = [
  /\b(image|picture|photo|screenshot|diagram|visual|look at|see this)\b/i,
];

function detectCapabilities(text: string): ModelCapability[] {
  const capabilities: Set<ModelCapability> = new Set();
  capabilities.add("text-generation");

  if (CODE_INDICATORS.some((r) => r.test(text))) capabilities.add("code-generation");
  if (REASONING_INDICATORS.some((r) => r.test(text))) capabilities.add("reasoning");
  if (CREATIVE_INDICATORS.some((r) => r.test(text))) capabilities.add("creative-writing");
  if (SUMMARY_INDICATORS.some((r) => r.test(text))) capabilities.add("summarization");
  if (DATA_INDICATORS.some((r) => r.test(text))) capabilities.add("data-analysis");
  if (TRANSLATION_INDICATORS.some((r) => r.test(text))) capabilities.add("translation");
  if (VISION_INDICATORS.some((r) => r.test(text))) capabilities.add("vision");

  return Array.from(capabilities);
}

function assessComplexity(text: string, capabilities: ModelCapability[]): "simple" | "moderate" | "complex" {
  const tokenCount = estimateTokenCount(text);
  const capCount = capabilities.length;

  if (tokenCount > 2000 || capCount >= 4) return "complex";
  if (tokenCount > 500 || capCount >= 2) return "moderate";
  return "simple";
}

export function analyzePrompt(
  prompt: string,
  conversationHistory: ConversationTurn[] = []
): PromptAnalysis {
  const capabilities = detectCapabilities(prompt);
  const complexity = assessComplexity(prompt, capabilities);

  const totalContextTokens = conversationHistory.reduce(
    (sum, turn) => sum + estimateTokenCount(turn.content), 0
  );

  const estimatedInputTokens = estimateTokenCount(prompt) + totalContextTokens;

  let estimatedOutputTokens: number;
  switch (complexity) {
    case "simple": estimatedOutputTokens = 200; break;
    case "moderate": estimatedOutputTokens = 800; break;
    case "complex": estimatedOutputTokens = 2000; break;
  }

  if (capabilities.includes("code-generation")) {
    estimatedOutputTokens = Math.max(estimatedOutputTokens, 1500);
  }

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    detectedCapabilities: capabilities,
    complexity,
    requiresReasoning: capabilities.includes("reasoning"),
    requiresCodeGen: capabilities.includes("code-generation"),
    requiresLongContext: estimatedInputTokens > 50000,
    requiresVision: capabilities.includes("vision"),
    conversationDepth: conversationHistory.length,
    rawPrompt: prompt,
  };
}

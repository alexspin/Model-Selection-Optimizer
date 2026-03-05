import type { PromptAnalysis, ModelCapability, ConversationTurn } from "../types/index.js";
import type { ClassificationResult } from "./semantic-classifier.js";

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3.5);
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.35;

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
  /\b(translate|translation|localize|in \w+ language)\b/i,
];

const ACTION_INDICATORS = [
  /\b(run|execute|deploy|install|start|stop|kill|check|download|upload)\b/i,
  /\b(file|directory|folder|process|port|server|service|cron)\b/i,
  /\b(data|csv|json|table|chart|statistics|calculate|compute|aggregate)\b/i,
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
  if (ACTION_INDICATORS.some((r) => r.test(text))) capabilities.add("function-calling");
  if (VISION_INDICATORS.some((r) => r.test(text))) capabilities.add("vision");

  return Array.from(capabilities);
}

function capabilitiesFromClassifications(
  results: ClassificationResult[],
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): ModelCapability[] {
  const capabilities: Set<ModelCapability> = new Set();
  capabilities.add("text-generation");
  for (const result of results) {
    if (result.confidence >= threshold) {
      for (const cap of result.definition.requiredCapabilities) {
        capabilities.add(cap);
      }
    }
  }
  return Array.from(capabilities);
}

function complexityFromClassifications(
  results: ClassificationResult[],
  tokenCount: number,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
  rawPrompt?: string
): "simple" | "moderate" | "complex" {
  if (results.length > 0) {
    const topResult = results[0];
    const topConfidence = topResult.confidence;
    const tier = topResult.definition.suggestedTier;

    if (topConfidence >= threshold) {
      if (tier === "frontier" || tokenCount > 2000) return "complex";
      if (tier === "budget" || tier === "local") return "simple";
      if (tier === "mid") return "moderate";
      if (tokenCount > 500) return "moderate";
      return "moderate";
    }
  }

  if (rawPrompt) {
    const caps = detectCapabilities(rawPrompt);
    const nonTrivialCaps = caps.filter((c) => c !== "text-generation");
    if (nonTrivialCaps.length >= 2) return "moderate";
    if (nonTrivialCaps.length === 1) {
      if (nonTrivialCaps[0] === "code-generation" || nonTrivialCaps[0] === "reasoning") {
        return "moderate";
      }
    }
    if (tokenCount > 500) return "moderate";
  }

  return "simple";
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
  conversationHistory: ConversationTurn[] = [],
  confidenceThreshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): PromptAnalysis {
  let capabilities = capabilitiesFromClassifications(classificationResults, confidenceThreshold);
  const hasConfidentResult = classificationResults.some((r) => r.confidence >= confidenceThreshold);
  if (!hasConfidentResult) {
    const regexCaps = detectCapabilities(prompt);
    const merged = new Set([...capabilities, ...regexCaps]);
    capabilities = Array.from(merged);
  }
  const totalContextTokens = conversationHistory.reduce(
    (sum, turn) => sum + estimateTokenCount(turn.content), 0
  );
  const estimatedInputTokens = estimateTokenCount(prompt) + totalContextTokens;
  const complexity = complexityFromClassifications(classificationResults, estimatedInputTokens, confidenceThreshold, prompt);
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

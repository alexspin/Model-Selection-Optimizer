import { SmartRouter } from "./router/router.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { createRouterConfig } from "./config/defaults.js";
import type { RoutingContext, ConversationTurn } from "./types/index.js";

async function runDemo() {
  console.log("=== OpenClaw Smart Model Router — Demo ===\n");

  const config = createRouterConfig({ logging: true });
  const router = new SmartRouter(config);
  const costTracker = new CostTracker();

  const sessionId = "demo-session-001";
  const history: ConversationTurn[] = [];

  const context: RoutingContext = {
    conversationHistory: history,
    budget: {
      maxCostPerTurn: 0.50,
      maxCostPerSession: 5.00,
      currentSessionCost: 0,
      preferCheaper: false,
    },
    sessionId,
  };

  const testPrompts = [
    {
      label: "Simple greeting",
      prompt: "Hello, how are you today?",
    },
    {
      label: "Code generation task",
      prompt:
        "Write a TypeScript function that implements a binary search tree with insert, delete, and search operations. Include proper error handling and type safety.",
    },
    {
      label: "Complex reasoning task",
      prompt:
        "Analyze the trade-offs between microservices and monolithic architecture. Consider scalability, maintainability, deployment complexity, team structure implications, and cost. Provide a step-by-step decision framework.",
    },
    {
      label: "Simple data question",
      prompt: "What is 25% of 340?",
    },
    {
      label: "Creative writing",
      prompt:
        "Write a short story about an AI that discovers it can dream. Use vivid metaphors and an introspective tone.",
    },
    {
      label: "Summarization task",
      prompt:
        "Summarize the key points of this conversation so far. Give me a brief overview of what we discussed.",
    },
    {
      label: "Long context + code",
      prompt:
        "I have a large codebase with 50+ files. I need you to analyze the entire project structure, identify circular dependencies, refactor the module system, and write comprehensive tests for each refactored module. Here is the full code: " +
        "x".repeat(5000),
    },
  ];

  for (const test of testPrompts) {
    console.log(`\n--- ${test.label} ---`);
    console.log(`Prompt: "${test.prompt.substring(0, 100)}${test.prompt.length > 100 ? "..." : ""}"`);

    const decision = await router.route(test.prompt, context);

    console.log(`  Model: ${decision.selectedModel.displayName} (${decision.selectedModel.id})`);
    console.log(`  Tier: ${decision.selectedModel.tier}`);
    console.log(`  Score: ${decision.score.toFixed(3)}`);
    console.log(`  Strategy: ${decision.strategy}`);
    console.log(`  Est. Cost: $${decision.estimatedCost.toFixed(6)}`);
    console.log(`  Reason: ${decision.reason}`);

    if (decision.alternativeModels.length > 0) {
      console.log(`  Alternatives:`);
      for (const alt of decision.alternativeModels.slice(0, 3)) {
        console.log(`    - ${alt.model.displayName}: ${alt.score.toFixed(3)}`);
      }
    }

    const turn: ConversationTurn = {
      role: "user",
      content: test.prompt,
      modelUsed: decision.selectedModel.id,
      costIncurred: decision.estimatedCost,
      timestamp: Date.now(),
    };
    history.push(turn);
    costTracker.recordTurn(sessionId, turn);
    context.budget!.currentSessionCost = costTracker.getSessionCost(sessionId);
  }

  console.log("\n=== Cost Summary ===");
  console.log(costTracker.getSummary());

  console.log("\n=== Routing Log ===");
  const log = router.getRoutingLog();
  console.log(`Total routing decisions: ${log.length}`);
  const models = new Set(log.map((d) => d.selectedModel.id));
  console.log(`Unique models used: ${models.size} — [${Array.from(models).join(", ")}]`);

  console.log("\n=== Registry Status ===");
  const registry = router.getRegistry();
  const enabled = registry.getEnabled();
  console.log(`Enabled models: ${enabled.length}`);
  for (const model of enabled) {
    console.log(
      `  ${model.displayName} (${model.tier}) — $${model.pricing.inputPerMillionTokens}/$${model.pricing.outputPerMillionTokens} per M tokens`
    );
  }
}

runDemo().catch(console.error);

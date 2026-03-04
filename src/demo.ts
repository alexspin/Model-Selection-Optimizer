import { SmartRouter } from "./router/router.js";
import { SemanticClassifier } from "./analyzers/semantic-classifier.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { createRouterConfig } from "./config/defaults.js";
import { defaultClassifications } from "./config/classifications.js";
import type { RoutingContext, ConversationTurn } from "./types/index.js";

async function runDemo() {
  console.log("=== OpenClaw Smart Model Router — Semantic Classification Demo ===\n");

  const config = createRouterConfig({ logging: true });
  const router = new SmartRouter(config);
  const costTracker = new CostTracker();

  console.log("Initializing semantic classifier (first run downloads the model)...\n");
  const classifier = new SemanticClassifier(defaultClassifications);
  await classifier.initialize();
  router.setSemanticClassifier(classifier);

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
    { label: "Simple Question", prompt: "What's the capital of Japan?" },
    { label: "Code Generation", prompt: "Write a TypeScript function that implements a LRU cache with generics and proper type safety." },
    { label: "Code Debugging", prompt: "My function returns undefined instead of the expected array. Here's the code, can you figure out why?" },
    { label: "Deep Reasoning", prompt: "Analyze the trade-offs between using a relational database versus a document store for a social media application. Consider scalability, query patterns, and developer experience." },
    { label: "Creative Writing", prompt: "Write a short blog post about how AI is changing the way developers work. Keep it engaging and personal." },
    { label: "Summarization", prompt: "Summarize the key points from our conversation so far. Give me a brief recap." },
    { label: "Data Analysis", prompt: "I have a CSV with 50,000 rows of sales data. Calculate the monthly growth rate and identify the top performing regions." },
    { label: "Translation", prompt: "Translate this technical documentation into Spanish, keeping the code examples intact." },
    { label: "Tool Use", prompt: "Search the web for the latest TypeScript release notes and create a summary file." },
    { label: "Conversation", prompt: "Thanks, that was helpful! Can you elaborate a bit more on the last point?" },
  ];

  for (const test of testPrompts) {
    console.log(`\n--- ${test.label} ---`);
    console.log(`Prompt: "${test.prompt.substring(0, 80)}${test.prompt.length > 80 ? "..." : ""}"`);

    const decision = await router.route(test.prompt, context);

    console.log(`  Model: ${decision.selectedModel.displayName} (${decision.selectedModel.id})`);
    console.log(`  Tier: ${decision.selectedModel.tier}`);
    console.log(`  Score: ${decision.score.toFixed(3)}`);
    console.log(`  Est. Cost: $${decision.estimatedCost.toFixed(6)}`);
    console.log(`  Reason: ${decision.reason}`);

    if (decision.alternativeModels.length > 0) {
      console.log(`  Alternatives:`);
      for (const alt of decision.alternativeModels.slice(0, 2)) {
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
  const models = new Set(log.map((d) => d.selectedModel.id));
  console.log(`Total decisions: ${log.length}`);
  console.log(`Unique models used: ${models.size} — [${Array.from(models).join(", ")}]`);
}

runDemo().catch(console.error);

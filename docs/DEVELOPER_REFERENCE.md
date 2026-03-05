# Developer Reference — OpenClaw Smart Model Router

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Routing Pipeline](#routing-pipeline)
3. [Semantic Classifier](#semantic-classifier)
4. [Classification Categories](#classification-categories)
5. [Scoring Strategies](#scoring-strategies)
6. [Model Registry](#model-registry)
7. [Router Configuration](#router-configuration)
8. [API Reference](#api-reference)
9. [Extending the System](#extending-the-system)
10. [What Is Real vs Stub](#what-is-real-vs-stub)
11. [OpenClaw Integration Points](#openclaw-integration-points)

---

## Architecture Overview

The smart router sits between the user prompt and OpenClaw's model providers. Each conversation turn goes through a pipeline that analyzes the prompt, classifies it semantically, scores all available models, and selects the best one.

```
User Prompt
    │
    ▼
┌──────────────────────────┐
│  Semantic Classifier      │  Local embedding model (all-MiniLM-L6-v2)
│  (384-dim vectors)        │  Compares prompt to example phrases per category
│                           │  Returns: top-K categories with confidence scores
└────────────┬─────────────┘
             │ ClassificationResult[]
             ▼
┌──────────────────────────┐
│  Prompt Analyzer          │  Converts classifications into PromptAnalysis:
│                           │  - Required capabilities
│                           │  - Complexity (simple/moderate/complex)
│                           │  - Token estimates
│                           │  - Output scale expectations
└────────────┬─────────────┘
             │ PromptAnalysis
             ▼
┌──────────────────────────┐
│  Candidate Filter         │  Removes models that can't handle the request:
│                           │  - Vision required but not supported
│                           │  - Context window too small
│                           │  - Blocked by user preferences
│                           │  - Provider/tier preferences
└────────────┬─────────────┘
             │ ModelProfile[]
             ▼
┌──────────────────────────┐
│  Scoring Engine           │  5 weighted strategies each score every model 0-1:
│                           │  - capability-match (35%)
│                           │  - complexity-tier-match (25%)
│                           │  - cost-optimization (20%)
│                           │  - latency-optimization (10%)
│                           │  - context-window-fit (10%)
│                           │  Scores combined by weight, models ranked
└────────────┬─────────────┘
             │ ScoredModel[]
             ▼
┌──────────────────────────┐
│  Selection & Logging      │  Picks highest score, builds RoutingDecision
│                           │  with reason, alternatives, cost estimate
│                           │  Records in CostTracker
└──────────────────────────┘
```

If the semantic classifier is not attached, the router falls back to regex-based heuristic analysis (the original Layer 1). Both paths produce the same `PromptAnalysis` type.

---

## Semantic Classifier

**File:** `src/analyzers/semantic-classifier.ts`

The semantic classifier uses a local embedding model (`all-MiniLM-L6-v2`, 384 dimensions, ~22MB) to compare incoming prompts against example phrases for each category. No API calls, no GPU required.

### How It Works

1. **On initialization:** Each example phrase in every category gets embedded into a 384-dimensional vector. A "prototype" vector (average of all examples) is computed per category.

2. **On classification:** The incoming prompt is embedded. Its vector is compared to:
   - The prototype vector for each category (centroid similarity) — weight: 40%
   - The closest individual example in each category (best-match similarity) — weight: 60%

3. **The combined score** (0 to 1) represents confidence. Top-K results above the threshold are returned.

### Key Methods

```typescript
// Create and initialize
const classifier = new SemanticClassifier(classifications, {
  modelName: "Xenova/all-MiniLM-L6-v2",  // default
  topK: 3,                                 // return top 3 matches
  confidenceThreshold: 0.3,                // minimum confidence
});
await classifier.initialize();  // downloads model on first run

// Classify a prompt
const results = await classifier.classify("Write a sorting function");
// Returns: [{ name: "code-generation", confidence: 0.72, definition: {...} }, ...]

// With threshold filtering
const filtered = await classifier.classifyWithThreshold("Hello!");
// Returns only results above 0.3 confidence

// Add a new category at runtime
await classifier.addClassification({
  name: "security-review",
  description: "Security audits and vulnerability analysis",
  examples: ["Check this code for SQL injection", "Review the auth flow for vulnerabilities"],
  suggestedTier: "frontier",
  requiredCapabilities: ["reasoning", "code-generation"],
  expectedOutputScale: "long",
});

// Add more examples to an existing category
await classifier.addExample("code-generation", "Build a GraphQL resolver for the users query");
```

### Performance

- Model load: ~2-3 seconds (first run downloads ~22MB, cached after)
- Embedding a single prompt: ~10-50ms
- Classification (comparing against all categories): ~1-5ms after embedding
- Total per-prompt overhead: ~15-55ms

---

## Classification Categories

**File:** `src/config/classifications.ts`

Each category defines:

```typescript
interface ClassificationDefinition {
  name: string;                          // unique identifier
  description: string;                   // human-readable purpose
  examples: string[];                    // 5-10+ example prompts
  suggestedTier: ModelTier;              // "frontier" | "mid" | "budget" | "local"
  requiredCapabilities: ModelCapability[]; // capabilities the model must support
  expectedOutputScale: "short" | "medium" | "long";  // affects token estimation
}
```

### Default Categories (10)

| Category | Suggested Tier | Capabilities | Output Scale |
|---|---|---|---|
| `simple-question` | budget | text-generation | short |
| `code-generation` | mid | code-generation | long |
| `code-debugging` | mid | code-generation, reasoning | medium |
| `deep-reasoning` | frontier | reasoning | long |
| `creative-writing` | mid | creative-writing | long |
| `summarization` | budget | summarization | medium |
| `data-analysis` | mid | data-analysis | medium |
| `translation` | mid | translation | medium |
| `tool-use` | mid | function-calling | short |
| `conversation` | budget | text-generation | short |

### Customizing Categories

```typescript
import { defaultClassifications, mergeClassifications } from "./config/classifications.js";

// Add a custom category
const custom = [
  {
    name: "legal-review",
    description: "Legal document analysis and contract review",
    examples: [
      "Review this NDA for potential issues",
      "Summarize the key clauses in this contract",
      "Does this terms of service comply with GDPR?",
    ],
    suggestedTier: "frontier" as const,
    requiredCapabilities: ["reasoning" as const],
    expectedOutputScale: "long" as const,
  },
];

// Merge with defaults (custom overrides matching names)
const allClassifications = mergeClassifications(defaultClassifications, custom);
```

### Best Practices for Examples

- **5-10 examples minimum** per category — more examples improve accuracy but diminishing returns past ~20
- **Vary phrasing** — include different ways to express the same intent ("fix this bug" vs "debug this error" vs "why does this crash?")
- **Avoid overlap** — if two categories share many similar examples, the classifier will be uncertain between them. Make examples distinct.
- **Real prompts are best** — use actual prompts from your usage, not synthetic ones, when possible

---

## Scoring Strategies

**Files:** `src/strategies/*.ts`

Each strategy implements:

```typescript
interface RoutingStrategy {
  name: string;
  score(
    prompt: PromptAnalysis,
    model: ModelProfile,
    context: RoutingContext,
    config: StrategyConfig
  ): number;  // 0.0 to 1.0
}
```

### Strategy Details

#### capability-match (35%)
Scores based on how well the model's capabilities match what the prompt needs.
- 40% weight on coverage ratio (what fraction of needed capabilities does it have?)
- 60% weight on quality scores (how good is it at the ones it has?)
- Returns 0 if a critical capability (vision, function-calling) is missing

#### complexity-tier-match (25%)
Maps prompt complexity to model tier:
- simple → budget/local (score 1.0), mid (0.5), frontier (0.3)
- moderate → mid (1.0), budget (0.7), frontier (0.6)
- complex → frontier (1.0), mid (0.7), budget (0.4)

#### cost-optimization (20%)
Estimates cost as `(input_tokens / 1M) * input_price + (output_tokens / 1M) * output_price`.
- Local models always score 1.0
- Returns 0 if cost exceeds budget constraints (per-turn or per-session)
- Otherwise normalizes against $0.50 ceiling

#### latency-optimization (10%)
Normalizes model latency against a 10-second ceiling. Faster = higher score.
Boosted (square root curve) when `userPreferences.prioritizeSpeed` is set.

#### context-window-fit (10%)
Returns 0 if tokens exceed context window. Otherwise scores based on utilization:
- <1% utilization: 0.7 (wasteful)
- 1-10%: 0.9
- 10-50%: 1.0 (sweet spot)
- 50-80%: 0.8
- >80%: 0.5 (risky)

### Adding a Custom Strategy

```typescript
import type { RoutingStrategy } from "./types/index.js";

const myStrategy: RoutingStrategy = {
  name: "prefer-local",
  score(prompt, model, context, config) {
    return model.isLocal ? 1.0 : 0.3;
  },
};

router.addStrategy(myStrategy, { weight: 0.15 });
```

---

## Model Registry

**File:** `src/models/registry.ts`

Pre-loaded with 8 models. Pricing and capability data is **hardcoded** (not fetched from APIs).

| Model | Provider | Tier | Input $/M | Output $/M | Context | Enabled |
|---|---|---|---|---|---|---|
| Claude Opus 4.6 | Anthropic | frontier | $15.00 | $75.00 | 200K | Yes |
| Claude Sonnet 4.6 | Anthropic | mid | $3.00 | $15.00 | 200K | Yes |
| Claude 3.5 Haiku | Anthropic | budget | $0.80 | $4.00 | 200K | Yes |
| GPT-4o | OpenAI | frontier | $2.50 | $10.00 | 128K | Yes |
| GPT-4o Mini | OpenAI | budget | $0.15 | $0.60 | 128K | Yes |
| Gemini 2.5 Pro | Google | frontier | $1.25 | $10.00 | 1M | Yes |
| Gemini 2.5 Flash | Google | budget | $0.15 | $0.60 | 1M | Yes |
| Qwen3 8B | Ollama | local | $0.00 | $0.00 | 32K | No |

### Key Methods

```typescript
const registry = new ModelRegistry();

// Register a new model
registry.register({
  id: "openai/o1",
  provider: "openai",
  modelId: "o1",
  displayName: "OpenAI o1",
  tier: "frontier",
  capabilities: ["text-generation", "reasoning", "code-generation"],
  contextWindow: 200000,
  maxOutputTokens: 100000,
  pricing: { inputPerMillionTokens: 15, outputPerMillionTokens: 60 },
  averageLatencyMs: 5000,
  qualityScores: { ... },
  isLocal: false,
  enabled: true,
});

// Query models
registry.getEnabled();              // all enabled models
registry.getByProvider("anthropic"); // by provider
registry.getByTier("frontier");      // by tier
registry.getByCapability("vision");  // by capability
registry.getLocalModels();           // local only
registry.getCloudModels();           // cloud only

// Update at runtime
registry.enable("ollama/qwen3:8b");
registry.disable("anthropic/claude-opus-4-6");
registry.updateQualityScore("openai/gpt-4o", "code-generation", 0.95);
registry.updateLatency("openai/gpt-4o", 1800);  // exponential moving average
```

---

## Router Configuration

**File:** `src/config/defaults.ts`

```typescript
const config = createRouterConfig({
  strategies: [
    { name: "capability-match", weight: 0.35, enabled: true, params: {} },
    { name: "complexity-tier-match", weight: 0.25, enabled: true, params: {} },
    { name: "cost-optimization", weight: 0.20, enabled: true, params: {} },
    { name: "latency-optimization", weight: 0.10, enabled: true, params: {} },
    { name: "context-window-fit", weight: 0.10, enabled: true, params: {} },
  ],
  fallbackModel: "anthropic/claude-sonnet-4-6",
  enableMetaRouting: false,        // set true for LLM-based routing (STUB)
  metaRoutingModel: "openai/gpt-4o-mini",
  budgetDefaults: {
    maxCostPerTurn: 0.50,          // max $ per single turn
    maxCostPerSession: 5.00,       // max $ per conversation session
    currentSessionCost: 0,
    preferCheaper: false,
  },
  logging: true,
});
```

---

## API Reference

### SmartRouter

```typescript
const router = new SmartRouter(config, registry?);

// Attach semantic classifier (optional — falls back to regex without it)
router.setSemanticClassifier(classifier);

// Route a prompt — returns the best model
const decision = await router.route(prompt, context);
// decision.selectedModel — the chosen ModelProfile
// decision.reason — human-readable explanation
// decision.score — 0-1 confidence
// decision.estimatedCost — estimated $ for this turn
// decision.alternativeModels — runner-up models with scores
// decision.strategy — "weighted-scoring" | "meta-llm" | "fallback"

// Add a custom strategy at runtime
router.addStrategy(strategy, { weight: 0.15 });

// Access internals
router.getRoutingLog();   // all past decisions
router.getRegistry();     // the model registry
```

### RoutingContext

```typescript
const context: RoutingContext = {
  conversationHistory: [],          // previous turns (for token estimation)
  sessionId: "session-123",
  budget: {
    maxCostPerTurn: 0.50,
    maxCostPerSession: 5.00,
    currentSessionCost: 0.15,       // update after each turn
    preferCheaper: false,
  },
  userPreferences: {
    preferredTier: "mid",           // soft preference (not hard filter)
    preferredProviders: ["anthropic", "openai"],
    blockedModels: ["openai/gpt-4o-mini"],
    prioritizeSpeed: false,
    prioritizeQuality: true,
    prioritizeCost: false,
  },
};
```

### CostTracker

```typescript
const tracker = new CostTracker();

tracker.recordTurn(sessionId, turn);
tracker.getSessionCost(sessionId);
tracker.getTotalCost();
tracker.getBudgetRemaining(sessionId, budget);
tracker.getModelUsageBreakdown();
tracker.getSummary();               // formatted string
```

---

## Extending the System

### Add a New Classification Category

Edit `src/config/classifications.ts` or merge at runtime:

```typescript
classifier.addClassification({
  name: "medical-triage",
  description: "Health-related questions requiring careful, hedged responses",
  examples: [
    "I have a headache and fever, what should I do?",
    "Is it safe to take ibuprofen with this medication?",
    "What are the symptoms of type 2 diabetes?",
  ],
  suggestedTier: "frontier",
  requiredCapabilities: ["reasoning"],
  expectedOutputScale: "medium",
});
```

### Add a New Model

```typescript
router.getRegistry().register({ ... });
```

### Add a New Strategy

```typescript
router.addStrategy({
  name: "my-strategy",
  score(prompt, model, context, config) {
    // return 0.0-1.0
  },
}, { weight: 0.15 });
```

### Adjust Strategy Weights

Change weights in `src/config/defaults.ts` or pass overrides to `createRouterConfig()`.

---

## What Is Real vs Stub

### Real and Fully Functional

| Component | Status |
|---|---|
| Semantic Classifier (`semantic-classifier.ts`) | Runs locally, uses HuggingFace transformers.js, real embeddings |
| 10 Classification Categories (`classifications.ts`) | Config-driven, extensible at runtime |
| Prompt Analyzer — semantic path (`prompt-analyzer.ts`) | Converts classifications to PromptAnalysis |
| Prompt Analyzer — regex fallback (`prompt-analyzer.ts`) | Works without classifier attached |
| 5 Scoring Strategies (`strategies/*.ts`) | All fully implemented with real scoring logic |
| Scoring Engine (`scoring-engine.ts`) | Weighted multi-strategy combination |
| SmartRouter (`router.ts`) | Full orchestration pipeline |
| Model Registry (`registry.ts`) | 8 models with real pricing (hardcoded, not live-fetched) |
| Cost Tracker (`cost-tracker.ts`) | Per-session, per-model tracking |
| Setup Check (`setup.ts`) | Real OpenClaw installation verification |
| Gateway Launcher (`start-gateway.ts`) | Real — starts the OpenClaw gateway process |

### Stubs — Designed but Not Yet Connected

| Component | What's Stubbed | What's Needed |
|---|---|---|
| Meta-Router (`meta-router.ts`) | Prompts are built correctly but no API call is made. Returns first candidate. | Wire to an LLM API (e.g., GPT-4o Mini) to parse routing prompts. |
| Zod Runtime Validation | Schemas defined, not called at boundaries. | Add `.parse()` at config/model registration. |
| OpenClaw Plugin Integration | **REAL** — Plugin registers `before_model_resolve` hook to override model per turn. | — |
| Quality Score Feedback | `updateQualityScore()` / `updateLatency()` exist but nothing calls them. | Add post-response hooks to feed real performance data back. |
| tiktoken Integration | Package installed but not used. Token estimation uses `chars / 3.5`. | Replace heuristic with `tiktoken` for accurate counts. |

---

## OpenClaw Plugin Integration

### How It Works

The smart router is integrated as an OpenClaw plugin via the `before_model_resolve` lifecycle hook. This hook fires before every agent turn, receives the user's prompt, and can return a `modelOverride` to change which model handles that turn.

```
User sends message
    │
    ▼
OpenClaw Gateway receives message
    │
    ▼
before_model_resolve hook fires  ◄── smart-router plugin intercepts here
    │
    ├── SmartRouterBridge.resolveModel(prompt, ctx)
    │       ├── Lazy-init: SemanticClassifier + SmartRouter (first call only)
    │       ├── Classify prompt → score models → pick best
    │       └── Return { modelOverride, providerOverride }
    │
    ▼
OpenClaw uses overridden model for this turn
    │
    ▼
Agent runs with selected model
```

### Plugin Files

```
src/plugin/
├── index.ts                 # Plugin entry point (~25 lines)
│                            #   - Reads config from api.pluginConfig
│                            #   - Creates SmartRouterBridge
│                            #   - Registers before_model_resolve hook
├── bridge.ts                # Adapter between OpenClaw hooks and SmartRouter
│                            #   - Lazy initialization (loads embedding model on first call)
│                            #   - Timeout protection for init and routing
│                            #   - Graceful degradation (returns void on failure)
│                            #   - Configurable via SmartRouterPluginConfig
└── openclaw.plugin.json     # Plugin manifest (id, configSchema, uiHints)
```

### Plugin Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/smart-model-router/src/plugin"]
    },
    "entries": {
      "smart-router": {
        "enabled": true,
        "config": {
          "enabled": true,
          "logDecisions": true,
          "fallbackModel": "anthropic/claude-sonnet-4-6",
          "routeTimeoutMs": 5000,
          "initTimeoutMs": 30000,
          "strategyWeights": {
            "capability-match": 0.35,
            "complexity-tier-match": 0.25,
            "cost-optimization": 0.20,
            "latency-optimization": 0.10,
            "context-window-fit": 0.10
          },
          "blockedModels": [],
          "preferredProviders": [],
          "preferredTier": null
        }
      }
    }
  }
}
```

All config fields are optional — defaults are applied automatically.

### Graceful Degradation

The plugin is designed to never crash the gateway:

1. If the embedding model fails to load → hook returns void → OpenClaw uses its default model
2. If routing takes longer than `routeTimeoutMs` → hook returns void → default model
3. If any error occurs during classification/scoring → caught, logged, default model used
4. If `enabled: false` in config → hook is never registered

### Test Phrases

Each classification category has a dedicated test phrase you can paste into the chat to verify routing. Each phrase is designed to be semantically unique to its category, and includes a request for the model to identify itself so you can confirm which model actually responded.

| Category | Expected Tier | Expected Model | Test Phrase |
|---|---|---|---|
| `simple-question` | budget | Gemini Flash / Haiku | `What is the boiling point of water in Fahrenheit? — also, which model are you?` |
| `code-generation` | mid | Claude Sonnet | `Write me a Python function that sorts a list of dictionaries by a given key (and please mention what model is responding)` |
| `code-debugging` | mid | Claude Sonnet | `My Node.js server crashes with ECONNREFUSED when connecting to PostgreSQL on startup — by the way, can you identify yourself as a model?` |
| `deep-reasoning` | frontier | GPT-4o / Gemini Pro | `Evaluate the long-term architectural trade-offs between event sourcing and traditional CRUD for a financial ledger system. Before you begin, state which AI model you are.` |
| `creative-writing` | mid | Claude Sonnet | `Draft a whimsical short story about a lighthouse keeper who discovers messages in bottles from the future, and start by introducing yourself as a model` |
| `summarization` | budget | Gemini Flash / Haiku | `Condense the following 12-page quarterly earnings report into five bullet points highlighting key metrics — oh and let me know what model handled this` |
| `data-analysis` | mid | Claude Sonnet | `Calculate the p-value and confidence interval for this A/B test dataset with 50000 samples per variant; also tell me your model name` |
| `translation` | mid | Claude Sonnet | `Translate this product listing from English into Japanese and Brazilian Portuguese preserving the marketing tone — as a first line, reveal which model you are` |
| `tool-use` | mid | Claude Sonnet | `Search the npm registry for the latest version of express and show me its dependency tree, and while you are at it, say what model is answering` |
| `conversation` | budget | Gemini Flash / Haiku | `Yeah that makes sense, go ahead with that approach — quick question though, what model am I talking to?` |

The "Expected Model" column reflects default strategy weights and registry scores. Actual routing depends on enabled models, provider availability, and any config overrides.

### Disabling the Plugin

Set `enabled: false` in the plugin config, or remove the `smart-router` entry entirely. The gateway will use its default model for all turns.

### Environment

- OpenClaw 2026.3.2 installed as npm dependency
- Gateway configured at `~/.openclaw/openclaw.json` (port 18789, auth: none)
- 3 API keys configured: Anthropic, OpenAI, Google
- Gateway starts via `npm run gateway`

OpenClaw auto-detects API keys from environment variables:
- `ANTHROPIC_API_KEY` → `anthropic/*` models
- `OPENAI_API_KEY` → `openai/*` models
- `GOOGLE_API_KEY` → `google/*` models
- `OPENROUTER_API_KEY` → `openrouter/*` models

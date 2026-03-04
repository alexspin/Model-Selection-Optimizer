# OpenClaw Smart Model Router

## Overview
A TypeScript extension module for OpenClaw (v2026.3.2) that dynamically selects the best AI model (cloud or local) for each conversation turn based on prompt complexity, required capabilities, cost, and latency.

---

## Getting Started

### Prerequisites
- Node.js 22 (pre-installed)
- At least one LLM provider API key (Anthropic, OpenAI, or Google)

### Setup
1. Run `npm run setup` to verify OpenClaw installation and see what's needed
2. Set API keys as environment secrets (at least one required):
   - `ANTHROPIC_API_KEY` — for Claude models
   - `OPENAI_API_KEY` — for GPT models
   - `GOOGLE_API_KEY` — for Gemini models
   - `OPENROUTER_API_KEY` — for multi-provider access
3. Start the gateway: `npm run gateway` (or `npm start`)
4. Run the router demo: `npm run dev`

### Scripts
- `npm run setup` — Check installation status and show setup instructions
- `npm run gateway` / `npm start` — Start the OpenClaw gateway
- `npm run dev` — Run the smart router demo
- `npm run build` — Compile TypeScript to `dist/`
- `npm run typecheck` — Type check without emitting

---

## What Is Real vs. What Is a Stub/Mock

### REAL — Fully Implemented and Working

| Component | File | What it does |
|---|---|---|
| **SmartRouter** | `src/router/router.ts` | Orchestrates the full routing pipeline: analyzes prompts, filters candidates, scores models, selects the best one. Fully functional. |
| **ScoringEngine** | `src/router/scoring-engine.ts` | Weighted multi-strategy scoring. Runs all enabled strategies, combines scores by weight, ranks models. Fully functional. |
| **PromptAnalyzer** | `src/analyzers/prompt-analyzer.ts` | Uses regex heuristics to detect prompt intent (code, reasoning, creative, vision, etc.), estimates token counts, and classifies complexity as simple/moderate/complex. Fully functional but heuristic-based (not AI-powered). |
| **ModelRegistry** | `src/models/registry.ts` | Catalog of 8 models with real pricing data, context windows, capability lists, and quality scores. Supports runtime registration, enable/disable, and quality score updates. Data is hardcoded but accurate as of project creation. |
| **5 Routing Strategies** | `src/strategies/*.ts` | Each strategy scores models independently. All 5 are fully implemented with real scoring logic (not placeholders). |
| **CostTracker** | `src/utils/cost-tracker.ts` | Tracks per-session and per-model spending with cost estimates based on real model pricing. Fully functional. |
| **Setup Check** | `src/setup.ts` | Verifies OpenClaw is installed, config is valid, and API keys are present. Real CLI utility. |
| **Gateway Launcher** | `src/start-gateway.ts` | Spawns the OpenClaw gateway process with proper signal handling. Real implementation. |
| **Demo** | `src/demo.ts` | Runs 7 test prompts through the router and shows which model was selected for each. The routing decisions are real — the demo does not make actual API calls to models, it only demonstrates the routing logic. |

### STUB — Designed but Not Yet Connected

| Component | File | What's stubbed | What's needed to make it real |
|---|---|---|---|
| **LLM Meta-Router** | `src/router/meta-router.ts` | The `selectModel()` method builds the correct system and user prompts for an LLM to make routing decisions, but does NOT actually call any model. It returns the first candidate with a stub message. | Wire it to OpenClaw's provider system or directly call an API (e.g., GPT-4o Mini) to parse the prompt and return a model selection as JSON. |
| **Zod Runtime Validation** | `src/types/index.ts` | Zod schemas are defined for enums (`ModelCapability`, `ModelTier`, `ModelProvider`) but are only used for type generation, not runtime validation of config or model data. | Add `.parse()` calls at config load and model registration boundaries. |
| **OpenClaw Plugin Integration** | Not yet created | The router module is standalone — it is not yet wired into OpenClaw's Plugin SDK (`openclaw/plugin-sdk`) to intercept conversation turns. | Create a plugin entry point that hooks into `api.onMessage()` and calls `router.route()` before forwarding to the selected model. |
| **Quality Score Feedback Loop** | `src/models/registry.ts` | The `updateQualityScore()` and `updateLatency()` methods exist and work, but nothing calls them automatically. Quality scores are static. | After each model response, measure quality (e.g., user rating, completion success) and call these methods to update scores over time. |

### NOT YET BUILT — Future Modules

| Concept | Purpose | Design Notes |
|---|---|---|
| **OpenClaw Plugin Entry Point** | Hook the router into OpenClaw's actual conversation pipeline | Use `openclaw/plugin-sdk` to register a plugin that intercepts messages, runs them through SmartRouter, and routes to the selected model |
| **Performance Monitor** | Track model response quality and latency over time | Feed real performance data back into the ModelRegistry to improve routing accuracy |
| **A/B Testing Strategy** | Periodically route to non-optimal models to gather comparison data | New strategy that occasionally selects lower-ranked models to validate scoring assumptions |
| **Conversation-Aware Strategy** | Factor in conversation history patterns (e.g., if coding, stay with code-strong model) | New strategy that considers the sequence of capabilities used in recent turns |

---

## Architecture

### How Routing Works (Step by Step)

```
User Prompt
    │
    ▼
┌─────────────────────┐
│  1. Prompt Analyzer  │  Regex-based detection of capabilities, complexity,
│                      │  token estimation (NOT AI-powered — fast heuristics)
└──────────┬──────────┘
           │ PromptAnalysis
           ▼
┌─────────────────────┐
│  2. Candidate Filter │  Filters enabled models by:
│                      │  - Required capabilities (vision, etc.)
│                      │  - Context window size
│                      │  - User preferences (blocked models, preferred providers/tiers)
└──────────┬──────────┘
           │ ModelProfile[]
           ▼
┌─────────────────────┐   ┌────────────────────────────────────────┐
│  3a. Scoring Engine  │   │  3b. Meta-Router (STUB)                │
│  (DEFAULT PATH)      │   │  Only used if enableMetaRouting=true   │
│                      │   │  AND complexity=complex                │
│  Runs 5 weighted     │   │  Would call a cheap LLM to pick the   │
│  strategies:         │   │  best model — currently returns first  │
│  - capability  35%   │   │  candidate with stub message           │
│  - complexity  25%   │   └────────────────────────────────────────┘
│  - cost        20%   │
│  - latency     10%   │
│  - context     10%   │
└──────────┬──────────┘
           │ ScoredModel[]
           ▼
┌─────────────────────┐
│  4. Selection        │  Picks highest-scoring model, builds RoutingDecision
│                      │  with reason, alternatives, estimated cost, and strategy used
└──────────┬──────────┘
           │ RoutingDecision
           ▼
┌─────────────────────┐
│  5. Cost Tracker     │  Records the turn's model usage and cost
└─────────────────────┘
```

### Routing Strategies (all real, all pluggable)

Each strategy implements the `RoutingStrategy` interface — a single `score()` function that returns 0.0 to 1.0.

| Strategy | Weight | Logic |
|---|---|---|
| `capability-match` | 35% | Checks if the model supports detected capabilities (code, reasoning, vision, etc.). Scores based on coverage ratio (40%) + quality scores per capability (60%). Returns 0 if a critical capability like vision is missing. |
| `complexity-tier-match` | 25% | Maps prompt complexity to model tier. Simple→budget/local, Moderate→mid, Complex→frontier. Perfect matches score 1.0, nearby tiers score lower. |
| `cost-optimization` | 20% | Calculates estimated cost (input + output tokens × model pricing). Returns 0 if cost exceeds budget constraints. Local models always score 1.0. |
| `latency-optimization` | 10% | Normalizes model latency against a 10-second ceiling. Faster models score higher. Boosted when user preferences flag `prioritizeSpeed`. |
| `context-window-fit` | 10% | Ensures the model's context window fits the estimated tokens. Returns 0 if it doesn't fit. Sweet spot (1-50% utilization) scores highest. |

Weights are configurable in `src/config/defaults.ts`. You can also add entirely new strategies at runtime via `router.addStrategy()`.

---

## Model Registry (Hardcoded Data)

The model registry contains real pricing and capability data, but it is **hardcoded at build time** — it does not fetch live pricing from provider APIs.

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

Quality scores per capability (0.0–1.0) are also hardcoded based on general benchmark data. These can be updated at runtime via `registry.updateQualityScore()` but nothing does this automatically yet.

---

## OpenClaw Configuration

**Config file:** `~/.openclaw/openclaw.json` (auto-created by setup)

```json
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "auth": { "mode": "none" }
  },
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace",
      "model": { "primary": "anthropic/claude-sonnet-4-6" }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {}
  }
}
```

**Gateway status:** Installed and config validated. Not yet running (needs API keys).

**Workspace:** `~/.openclaw/workspace` — created but empty. OpenClaw populates this with agent state (AGENTS.md, SOUL.md, skills) once the gateway starts.

---

## Project Structure
```
/
├── package.json                # Project config, scripts, dependencies
├── tsconfig.json               # TypeScript config (ESM, strict, Node22)
├── replit.md                   # This file
├── src/
│   ├── index.ts                # Public API — exports all classes and types
│   ├── demo.ts                 # Demo: routes 7 test prompts, shows decisions
│   ├── setup.ts                # CLI: checks OpenClaw install, config, API keys
│   ├── start-gateway.ts        # CLI: starts OpenClaw gateway with env vars
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces + Zod schemas
│   ├── models/
│   │   └── registry.ts         # Model catalog (8 models, hardcoded data)
│   ├── analyzers/
│   │   └── prompt-analyzer.ts  # Regex-based prompt analysis (heuristic)
│   ├── config/
│   │   └── defaults.ts         # Default router config (strategy weights, budget)
│   ├── router/
│   │   ├── router.ts           # SmartRouter — main orchestrator (REAL)
│   │   ├── scoring-engine.ts   # Weighted multi-strategy scorer (REAL)
│   │   └── meta-router.ts      # LLM-based routing (STUB — prompts built, no API call)
│   ├── strategies/
│   │   ├── index.ts            # Strategy registry and lookup
│   │   ├── capability-strategy.ts   # (REAL)
│   │   ├── complexity-strategy.ts   # (REAL)
│   │   ├── cost-strategy.ts         # (REAL)
│   │   ├── latency-strategy.ts      # (REAL)
│   │   └── context-window-strategy.ts # (REAL)
│   └── utils/
│       └── cost-tracker.ts     # Cost tracking per session/model (REAL)
└── ~/.openclaw/
    ├── openclaw.json           # OpenClaw gateway config (REAL, validated)
    └── workspace/              # Agent workspace (empty until gateway starts)
```

## Tech Stack
- **Runtime:** Node.js 22.22.0
- **Language:** TypeScript 5.9 (ESM modules, strict mode)
- **Framework:** OpenClaw 2026.3.2
- **Validation:** Zod 4.3 (schemas defined, runtime validation not yet wired)
- **Execution:** tsx 4.21 (TypeScript runner, no build step needed for dev)

## Dependencies
- `openclaw` — AI agent framework (gateway, plugin SDK, model providers)
- `typescript` — Type checking and compilation
- `tsx` — Run TypeScript directly without building
- `zod` — Schema validation (types defined, runtime validation planned)
- `tiktoken` — Token counting (installed, not yet integrated — prompt analyzer uses heuristic estimation instead)
- `@types/node` — Node.js type definitions

## Key Design Decisions
- Each routing strategy is a standalone module implementing the `RoutingStrategy` interface — easy to add new ones
- Strategies are weighted and composable via configuration (change weights without code changes)
- User preferences (blocked models, preferred providers/tiers) are enforced as hard filters during candidate selection
- Meta-routing (using an LLM to pick the best model) is opt-in and stubbed for future integration
- Model registry supports runtime registration, enable/disable, and quality score updates
- Budget constraints are enforced at both per-turn and per-session levels
- Strategy validation warns on unknown names and throws if no strategies are enabled
- The prompt analyzer uses fast regex heuristics (not AI) — suitable for real-time routing with near-zero latency

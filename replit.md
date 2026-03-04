# OpenClaw Smart Model Router

## Overview
A TypeScript extension module for OpenClaw that dynamically selects the best AI model (cloud or local) for each conversation turn based on prompt complexity, required capabilities, cost, and latency.

## Architecture

### Core Components
- **SmartRouter** (`src/router/router.ts`) — Main orchestrator that coordinates prompt analysis, model scoring, and selection
- **ModelRegistry** (`src/models/registry.ts`) — Catalog of available models with metadata (pricing, capabilities, quality scores, latency)
- **PromptAnalyzer** (`src/analyzers/prompt-analyzer.ts`) — Analyzes prompts to detect complexity, required capabilities, token estimates
- **ScoringEngine** (`src/router/scoring-engine.ts`) — Weighted multi-strategy scoring system
- **MetaRouter** (`src/router/meta-router.ts`) — Uses an LLM to make routing decisions for complex prompts (stub, ready for integration)
- **CostTracker** (`src/utils/cost-tracker.ts`) — Tracks per-session and per-model spending

### Routing Strategies (pluggable, weighted)
- `capability-match` — Scores models on capability coverage and quality
- `complexity-tier-match` — Matches prompt complexity to model tier (frontier/mid/budget/local)
- `cost-optimization` — Prefers cheaper models within budget constraints
- `latency-optimization` — Prefers faster models when speed matters
- `context-window-fit` — Ensures model can handle the token volume

### Supported Models (built-in registry)
- Anthropic: Claude Opus 4.6, Claude Sonnet 4.6, Claude 3.5 Haiku
- OpenAI: GPT-4o, GPT-4o Mini
- Google: Gemini 2.5 Pro, Gemini 2.5 Flash
- Local: Ollama Qwen3 8B (disabled by default)

## Project Structure
```
src/
├── index.ts                    # Public API exports
├── demo.ts                     # Demo runner
├── types/index.ts              # Type definitions (zod-validated)
├── models/registry.ts          # Model catalog
├── analyzers/prompt-analyzer.ts # Prompt analysis
├── config/defaults.ts          # Default router configuration
├── router/
│   ├── router.ts               # Main SmartRouter class
│   ├── scoring-engine.ts       # Multi-strategy scoring
│   └── meta-router.ts          # LLM-based meta-routing
├── strategies/
│   ├── index.ts                # Strategy registry
│   ├── capability-strategy.ts
│   ├── complexity-strategy.ts
│   ├── cost-strategy.ts
│   ├── latency-strategy.ts
│   └── context-window-strategy.ts
└── utils/
    └── cost-tracker.ts         # Cost tracking
```

## Tech Stack
- TypeScript with ESM modules
- Node.js 22
- OpenClaw (AI agent framework)
- Zod (schema validation)
- tsx (TypeScript execution)

## Scripts
- `npm run dev` / `npm start` — Run the demo
- `npm run build` — Compile TypeScript
- `npm run typecheck` — Type check without emitting

## Key Design Decisions
- Each routing strategy is a standalone module implementing the `RoutingStrategy` interface
- Strategies are weighted and composable via configuration
- Meta-routing (using an LLM to pick the best model) is opt-in and stubbed for OpenClaw provider integration
- Model registry supports runtime registration, enabling/disabling, and quality score updates
- Budget constraints are enforced at both per-turn and per-session levels

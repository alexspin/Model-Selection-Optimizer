# OpenClaw Smart Model Router

## Overview
A TypeScript extension module for OpenClaw that dynamically selects the best AI model (cloud or local) for each conversation turn based on prompt complexity, required capabilities, cost, and latency.

## Getting Started

### Prerequisites
- Node.js 22 (pre-installed)
- At least one LLM provider API key

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
- `npm run build` — Compile TypeScript
- `npm run typecheck` — Type check without emitting

## Architecture

### Core Components
- **SmartRouter** (`src/router/router.ts`) — Main orchestrator that coordinates prompt analysis, model scoring, and selection
- **ModelRegistry** (`src/models/registry.ts`) — Catalog of available models with metadata (pricing, capabilities, quality scores, latency)
- **PromptAnalyzer** (`src/analyzers/prompt-analyzer.ts`) — Analyzes prompts to detect complexity, required capabilities, token estimates
- **ScoringEngine** (`src/router/scoring-engine.ts`) — Weighted multi-strategy scoring system
- **MetaRouter** (`src/router/meta-router.ts`) — Uses an LLM to make routing decisions for complex prompts (stub, ready for integration)
- **CostTracker** (`src/utils/cost-tracker.ts`) — Tracks per-session and per-model spending
- **Setup** (`src/setup.ts`) — Health check and status for OpenClaw installation
- **Gateway Launcher** (`src/start-gateway.ts`) — Starts the OpenClaw gateway with proper env

### Routing Strategies (pluggable, weighted)
- `capability-match` (35%) — Scores models on capability coverage and quality
- `complexity-tier-match` (25%) — Matches prompt complexity to model tier (frontier/mid/budget/local)
- `cost-optimization` (20%) — Prefers cheaper models within budget constraints
- `latency-optimization` (10%) — Prefers faster models when speed matters
- `context-window-fit` (10%) — Ensures model can handle the token volume

### Supported Models (built-in registry)
- Anthropic: Claude Opus 4.6, Claude Sonnet 4.6, Claude 3.5 Haiku
- OpenAI: GPT-4o, GPT-4o Mini
- Google: Gemini 2.5 Pro, Gemini 2.5 Flash
- Local: Ollama Qwen3 8B (disabled by default)

## Project Structure
```
src/
├── index.ts                    # Public API exports
├── demo.ts                     # Demo runner showing routing decisions
├── setup.ts                    # OpenClaw installation health check
├── start-gateway.ts            # OpenClaw gateway launcher
├── types/index.ts              # Type definitions (zod-validated)
├── models/registry.ts          # Model catalog with pricing/capabilities
├── analyzers/prompt-analyzer.ts # Prompt complexity/capability detection
├── config/defaults.ts          # Default router configuration
├── router/
│   ├── router.ts               # Main SmartRouter class
│   ├── scoring-engine.ts       # Multi-strategy weighted scoring
│   └── meta-router.ts          # LLM-based meta-routing (stub)
├── strategies/
│   ├── index.ts                # Strategy registry
│   ├── capability-strategy.ts
│   ├── complexity-strategy.ts
│   ├── cost-strategy.ts
│   ├── latency-strategy.ts
│   └── context-window-strategy.ts
└── utils/
    └── cost-tracker.ts         # Cost tracking per session/model
```

## OpenClaw Configuration
- Config file: `~/.openclaw/openclaw.json`
- Gateway port: 18789
- Default model: anthropic/claude-sonnet-4-6
- Workspace: `~/.openclaw/workspace`

## Tech Stack
- TypeScript with ESM modules
- Node.js 22
- OpenClaw 2026.3.2 (AI agent framework)
- Zod (schema validation)
- tsx (TypeScript execution)

## Key Design Decisions
- Each routing strategy is a standalone module implementing the `RoutingStrategy` interface
- Strategies are weighted and composable via configuration
- User preferences (blocked models, preferred providers/tiers) are enforced during candidate filtering
- Meta-routing (using an LLM to pick the best model) is opt-in and stubbed for OpenClaw provider integration
- Model registry supports runtime registration, enabling/disabling, and quality score updates
- Budget constraints are enforced at both per-turn and per-session levels
- Strategy validation warns on unknown names, throws if no strategies are enabled

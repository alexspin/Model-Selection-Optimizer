# OpenClaw Smart Model Router

## Overview
A TypeScript extension module for OpenClaw (v2026.3.2) that dynamically selects the best AI model (cloud or local) for each conversation turn. Uses a local embedding model to semantically classify prompts, then either maps directly to a configured model (fast path, when confidence >= threshold) or scores all available models through a weighted multi-strategy engine (scoring path, when uncertain).

## Getting Started

### Prerequisites
- Node.js 22 (pre-installed)
- At least one LLM provider API key (Anthropic, OpenAI, or Google)

### Setup
1. `npm run setup` — verify installation and API key status
2. Set API keys as secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
3. `npm run gateway` — start the OpenClaw gateway
4. `npm run dev` — run the router demo with semantic classification

### Scripts
- `npm run setup` — health check
- `npm run gateway` / `npm start` — start OpenClaw gateway
- `npm run dev` — router demo with 5 classification categories
- `npm run build` — compile TypeScript to `dist/`
- `npm run typecheck` — type check without emitting

## Project Structure
```
src/
├── index.ts                         # Public API exports
├── demo.ts                          # Demo with semantic classification
├── setup.ts                         # OpenClaw health check
├── start-gateway.ts                 # Gateway launcher
├── types/index.ts                   # All TypeScript interfaces + Zod schemas
├── models/registry.ts               # Model registry (loads from routing.json)
├── analyzers/
│   ├── prompt-analyzer.ts           # Confidence-aware complexity detection
│   └── semantic-classifier.ts       # Embedding-based prompt classifier (REAL)
├── config/
│   ├── routing.json                 # ** SINGLE CONFIG ** — models, commands, classes (all in one)
│   ├── routing-config.ts            # Loader/helpers for routing.json
│   ├── defaults.ts                  # Default router config (strategy weights)
│   ├── classifications.ts           # Builds classifications from routing.json
│   └── examples/                    # 25 example prompts per category (JSON files)
│       ├── simple.json
│       ├── coding.json
│       ├── reasoning.json
│       ├── creative.json
│       └── action.json
├── plugin/
│   ├── index.ts                     # OpenClaw plugin entry (commands + 3 hooks)
│   ├── bridge.ts                    # SmartRouterBridge adapter (config-driven routing)
│   └── openclaw.plugin.json         # Plugin manifest (id, configSchema, uiHints)
├── router/
│   ├── router.ts                    # SmartRouter orchestrator
│   ├── scoring-engine.ts            # Weighted multi-strategy scorer
│   └── meta-router.ts              # LLM-based routing (STUB)
├── strategies/
│   ├── index.ts                     # Strategy registry
│   ├── capability-strategy.ts       # (35% weight)
│   ├── complexity-strategy.ts       # (25% weight)
│   ├── cost-strategy.ts             # (20% weight)
│   ├── latency-strategy.ts          # (10% weight)
│   └── context-window-strategy.ts   # (10% weight)
└── utils/
    └── cost-tracker.ts              # Cost tracking per session/model

.openclaw/                           # OpenClaw runtime config (IN PROJECT TREE)
├── openclaw.json                    # Gateway config (providers, API keys, plugin entry)
└── workspace/
    ├── IDENTITY.md                  # Model identity instructions
    └── SOUL.md                      # Agent personality

scripts/
└── copy-assets.js                   # Build helper: copies JSON/manifest to dist/

docs/
└── DEVELOPER_REFERENCE.md           # Full architecture + API reference

setup.sh                             # Install script for manual/drop-in deployment
INSTALL.md                           # Installation guide (npm, manual, dev-mode)
```

## Routing Config (`src/config/routing.json`)
This is the central config file. All routing decisions flow from it.

### Commands
Commands are registered with OpenClaw's command system for namespace protection and discoverability (appear in `/help`). Each command maps to a routing class and includes help text shown when the user types the bare command.

```json
"commands": {
  "/simple": { "class": "simple", "helpText": "..." },
  "/cheap":  { "class": "simple", "helpText": "..." },
  "/coding": { "class": "coding", "helpText": "..." },
  ...
}
```

Bare `/best` → shows help text. `/best <message>` → routes message through the reasoning class to Gemini 2.5 Pro.

### Classes → Models
```json
"classes": {
  "simple":    { "model": "google/gemini-2.5-flash", ... },
  "coding":    { "model": "anthropic/claude-sonnet-4-6", ... },
  "reasoning": { "model": "google/gemini-2.5-pro", ... },
  "creative":  { "model": "anthropic/claude-sonnet-4-6", ... },
  "action":    { "model": "anthropic/claude-sonnet-4-6", ... }
}
```
To change which model handles a class: change the `model` field.
To add a new class: add an entry with description, model, examples file, capabilities, outputScale. Drop a new examples JSON in `src/config/examples/`.

## OpenClaw Plugin Integration
The plugin uses a hybrid approach: OpenClaw's native command system for namespace protection + lifecycle hooks for routing.

### Registered Commands (acceptsArgs: false)
- `/simple`, `/cheap`, `/coding`, `/creative`, `/action`, `/reason`, `/best`
- Both `/` and `~` prefixes are supported (e.g., `~simple hello` works same as `/simple hello`)
- `~` prefix exists for Telegram/nchat compatibility — those clients intercept `/` and `!` commands natively
- Bare command → returns help text describing the routing class
- Command with args (e.g., `/best explain this`) → falls through to agent pipeline, picked up by hooks
- Optional BotFather registration: `channels.telegram.customCommands` in `openclaw.json` for native Telegram autocomplete

### Hooks (3 registered)
- `message_received` — captures clean user text from channel messages (Telegram, Discord), stores routing intent
- `before_model_resolve` — applies stored intent OR parses prompt text (TUI fallback), returns model override
- `before_prompt_build` — injects model identity context + strips routing command prefixes (`/` or `!`)

### Bridge (`src/plugin/bridge.ts`)
- Lazy init with timeout protection
- `storeMessage()` / `consumePendingMessage()` — stores clean user text from `message_received` for consumption in `before_model_resolve`
  - Single pending slot (safe because OpenClaw's lane serialization guarantees message_received→before_model_resolve is atomic per request)
  - TTL-based expiry (30s) to prevent stale intents
- `parseRoutePrefix()` — centralized prefix parser, returns discriminated union `PrefixParseResult` (`"routed"` | `"bare-command"` | `null`). Used by both `message_received` (index.ts) and `resolveModel` fallback path. Single source of truth for prefix logic.
- `RoutingDecision.classificationName` — structured field populated by router, consumed directly by bridge (no regex parsing)
- Config-driven class→model resolution via routing.json
- Per-session routing state (keyed by `ctx.sessionKey`) to prevent cross-session leaks

## Routing Decision Pipeline
Two paths based on classifier confidence:
1. **Fast path** (confidence >= `classificationThreshold`): Bridge looks up class in routing.json → overrides scorer's result with config-mapped model
2. **Scoring path** (below threshold): Prompt analyzer builds a profile → 5 strategies score every model → highest score wins
Note: the scoring engine runs in both cases (the router doesn't short-circuit), but on the fast path the bridge replaces the scorer's pick with the config mapping.

### Prompt Analyzer
When the scoring path runs, the analyzer extracts from classification results:
- **Required capabilities**: from `definition.requiredCapabilities` of each result above threshold
- **Complexity**: from top result's `definition.suggestedTier` (frontier→complex, mid→moderate, budget→simple). Prompts >2000 tokens always "complex"
- **Input tokens**: `prompt.length / 3.5` + conversation history
- **Output tokens**: from top result's `definition.expectedOutputScale` (short=200, medium=800, long=2000)
- If classifier is unavailable entirely, falls back to regex keyword matching for capabilities

### Configurable Threshold
- Default = 0.35, configurable via `classificationThreshold` in plugin config (range 0.1–0.9)
- Lower → more prompts take the fast path (faster, but less nuanced)
- Higher → more prompts go through full scoring (slower, but considers cost/latency/capabilities)

## Packaging & Distribution
- **npm install**: `package.json` has `"openclaw": { "extensions": ["dist/plugin/index.js"] }` for auto-discovery
- **Manual install**: `bash setup.sh` — installs deps, builds, prints config instructions
- **Build**: `npm run build` — compiles TS + copies assets (routing.json, examples, manifest) to `dist/`
- **Install guide**: `INSTALL.md` — covers npm, manual, and dev-mode installation

## Dependencies
- `openclaw` — AI agent framework
- `@huggingface/transformers` — local embedding model (all-MiniLM-L6-v2)
- `typescript`, `tsx` — TypeScript tooling
- `zod` — schema validation
- `tiktoken` — token counting (installed, not yet integrated)

## OpenClaw Config
- `.openclaw/` directory lives inside the project tree (not in `~/`)
- `OPENCLAW_HOME` env var is set to the project root so OpenClaw finds `.openclaw/` here
- Gateway: port 18789, auth: none
- Default model: `anthropic/claude-sonnet-4-6`
- Plugin: smart-router enabled via `plugins.entries.smart-router`
- Google provider: Gemini 2.5 Pro + Flash configured via `models.providers.google`
- Agent-level `models.json` and `auth-profiles.json` removed (consolidated into `openclaw.json`; backups at `.bak`)
- Telegram channel: `botToken: ${TELEGRAM_BOT_TOKEN}`, `customCommands` for all 7 routing commands
- Secrets: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `TELEGRAM_BOT_TOKEN`

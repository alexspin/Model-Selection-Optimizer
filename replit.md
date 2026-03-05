# OpenClaw Smart Model Router

## Overview
A TypeScript extension module for OpenClaw (v2026.3.2) that dynamically selects the best AI model (cloud or local) for each conversation turn. Uses a local embedding model to semantically classify prompts, then scores all available models through a weighted multi-strategy engine.

## Getting Started

### Prerequisites
- Node.js 22 (pre-installed)
- At least one LLM provider API key (Anthropic, OpenAI, or Google)

### Setup
1. `npm run setup` — verify installation and API key status
2. Set API keys as secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
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
├── models/registry.ts               # Model catalog (5 models, real pricing)
├── analyzers/
│   ├── prompt-analyzer.ts           # Confidence-aware complexity detection
│   └── semantic-classifier.ts       # Embedding-based prompt classifier (REAL)
├── config/
│   ├── routing.json                 # ** MAIN CONFIG ** — commands, classes, model mappings
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
├── openclaw.json                    # Gateway config (providers, plugin, port)
├── agents/main/agent/
│   └── auth-profiles.json           # Provider auth (Google API key ref)
└── workspace/
    ├── IDENTITY.md                  # Model identity instructions
    └── SOUL.md                      # Agent personality

docs/
└── DEVELOPER_REFERENCE.md           # Full architecture + API reference
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
- Bare command → returns help text describing the routing class
- Command with args (e.g., `/best explain this`) → falls through to agent pipeline, picked up by hooks

### Hooks (3 registered)
- `message_received` — captures clean user text from channel messages (Telegram, Discord), stores routing intent
- `before_model_resolve` — applies stored intent OR parses prompt text (TUI fallback), returns model override
- `before_prompt_build` — injects model identity context + strips slash-command prefixes

### Bridge (`src/plugin/bridge.ts`)
- Lazy init with timeout protection
- `setRouteIntent()` / `consumeRouteIntent()` — per-session state for cross-hook communication
- `parseRoutePrefix()` — TUI fallback prompt parsing (extracts user message from OpenClaw's wrapped prompt format)
- Config-driven class→model resolution via routing.json

## Confidence Thresholds
- LOW = 0.35 — below this, classification defaults to fallbackClass
- If top classification confidence >= 0.35, the class's configured model is used
- Frontier-tier models or long prompts (>2000 tokens) → "complex" complexity

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
- Auth: `.openclaw/agents/main/agent/auth-profiles.json` references `GOOGLE_API_KEY` env var

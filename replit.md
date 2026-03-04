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
- `npm run dev` — router demo with all 10 classification categories
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
├── models/registry.ts               # Model catalog (8 models, real pricing)
├── analyzers/
│   ├── prompt-analyzer.ts           # Regex fallback + semantic-aware analyzer
│   └── semantic-classifier.ts       # Embedding-based prompt classifier (REAL)
├── config/
│   ├── defaults.ts                  # Default router config (strategy weights)
│   └── classifications.ts           # 10 classification categories with examples
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
```

## Dependencies
- `openclaw` — AI agent framework
- `@huggingface/transformers` — local embedding model (all-MiniLM-L6-v2)
- `typescript`, `tsx` — TypeScript tooling
- `zod` — schema validation
- `tiktoken` — token counting (installed, not yet integrated)

## OpenClaw Config
- File: `~/.openclaw/openclaw.json`
- Gateway: port 18789, auth: none
- Default model: `anthropic/claude-sonnet-4-6`
- Workspace: `~/.openclaw/workspace`

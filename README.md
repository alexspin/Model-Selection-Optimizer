# Smart Model Router for OpenClaw

A plugin for [OpenClaw](https://openclaw.dev) that automatically picks the best AI model for each conversation turn. Instead of manually switching between models, the router analyzes your prompt and routes it to the right model based on what you're asking.

## What it does

- **Coding questions** go to Claude Sonnet 4.6 (strong at code generation and debugging)
- **Deep reasoning tasks** go to Gemini 2.5 Pro (strong at analysis and multi-step logic)
- **Simple questions** go to Gemini 2.5 Flash (fast, cheap, good enough for quick answers)
- **Creative writing** goes to Claude Sonnet 4.6 (strong at prose, emails, blog posts)

The routing happens automatically on every turn. You can also force a specific route with slash commands like `/coding`, `/reason`, `/simple`, `/creative`, `/action`, `/best`, or `/cheap`.

## How routing works

Every prompt goes through two possible paths:

1. **Fast path** — A semantic classifier compares your prompt against known examples (coding questions, simple questions, reasoning tasks, etc.). If it's confident about the match, it routes directly to the model mapped to that class.

2. **Scoring path** — If the classifier isn't confident, a scoring engine evaluates all available models using five strategies: capability match, complexity-tier fit, cost optimization, latency, and context window size. The highest-scoring model wins.

Both paths are config-driven. You control which models are available, which classes exist, and how the scoring weights work.

## Quick start

```bash
git clone https://github.com/alexspin/Model-Selection-Optimizer.git
cd Model-Selection-Optimizer
npm install
npm run build
```

Then point your OpenClaw config at the plugin. See [INSTALL.md](INSTALL.md) for the full step-by-step setup including API keys, gateway config, and verification.

## Slash commands

| Command | Routes to | Use for |
|---------|-----------|---------|
| `/simple` | Gemini 2.5 Flash | Quick facts, casual chat, follow-ups |
| `/cheap` | Gemini 2.5 Flash | Alias for /simple |
| `/coding` | Claude Sonnet 4.6 | Writing code, debugging, code review |
| `/creative` | Claude Sonnet 4.6 | Blog posts, emails, translation |
| `/action` | Claude Sonnet 4.6 | Tool calls, file operations |
| `/reason` | Gemini 2.5 Pro | Deep analysis, architecture, trade-offs |
| `/best` | Gemini 2.5 Pro | Alias for /reason |

Type a bare command (e.g., `/best`) to see help. Type with a message (e.g., `/coding write a function to reverse a string`) to route that message.

## Project structure

```
src/
  plugin/           Plugin entry point, bridge, hooks
    index.ts         register() — commands, hooks, session state
    bridge.ts        SmartRouterBridge — classification, scoring, model resolution
  analyzers/         Prompt analysis (semantic classifier + regex fallback)
  scoring/           5-strategy scoring engine
  models/            Model registry (profiles, tiers, quality scores)
  config/            Routing config and example files
    routing.json     Commands → classes → models mapping
    examples/        Training examples for each class (coding.json, simple.json, etc.)
  types/             TypeScript type definitions
```

## Configuration

All config lives in two places:

- **`src/config/routing.json`** — Maps commands to classes and classes to models. This is where you change which model handles what.
- **`src/models/registry.ts`** — Defines every model the router knows about: tier, capabilities, quality scores, pricing, latency.

To add a new model or change routing, see the "Adding a new model" section in [INSTALL.md](INSTALL.md).

Try the test script in the root directory to see it route. 

Plugin behavior (thresholds, logging, fallback model, strategy weights) is configured in your `openclaw.json` under `plugins.entries.smart-router.config`. See [INSTALL.md](INSTALL.md) for the full options table.

## Requirements

- Node.js 20+
- OpenClaw 2026.3.x
- At least one LLM provider API key (Anthropic and/or Google recommended)

## License

MIT

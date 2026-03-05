# Installing openclaw-smart-router

Smart model routing plugin for OpenClaw — dynamically selects the best AI model per conversation turn based on semantic prompt classification, required capabilities, cost, and latency.

## Prerequisites

- Node.js 20+
- OpenClaw 2026.3.x installed and configured
- At least one LLM provider API key (Anthropic and/or Google recommended)

## Option A: npm install (recommended)

```bash
# From your OpenClaw project directory:
npm install openclaw-smart-router
```

OpenClaw auto-discovers plugins that have the `"openclaw"` key in their `package.json`. After installing, add the plugin config to your `.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "smart-router": {
        "enabled": true,
        "config": {
          "enabled": true,
          "logDecisions": true
        }
      }
    }
  }
}
```

Restart your OpenClaw gateway and the plugin will load automatically.

## Option B: Manual / drop-in install

Clone or copy the plugin into your project:

```bash
git clone https://github.com/yourorg/openclaw-smart-router.git
cd openclaw-smart-router
bash setup.sh
```

The setup script will:
1. Install dependencies
2. Build the plugin (TypeScript to JavaScript)
3. Show you the config to add to `.openclaw/openclaw.json`

If you prefer to skip the script, do it manually:

```bash
npm install
npm run build
```

Then add to `.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "smart-router": {
        "enabled": true,
        "config": {
          "enabled": true,
          "logDecisions": true
        }
      }
    },
    "load": {
      "paths": ["/absolute/path/to/openclaw-smart-router/dist/plugin"]
    }
  }
}
```

## Option C: Development mode (TypeScript source)

For development, you can point OpenClaw directly at the TypeScript source (requires `tsx`):

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/openclaw-smart-router/src/plugin"]
    }
  }
}
```

## Configuration

All options can be set in `.openclaw/openclaw.json` under `plugins.entries.smart-router.config`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the router |
| `logDecisions` | boolean | `true` | Log which model was selected and why |
| `fallbackModel` | string | `anthropic/claude-sonnet-4-6` | Model to use if routing fails |
| `classificationThreshold` | number | `0.35` | Confidence cutoff (0.1-0.9) for direct class→model routing. Below this, the scoring pipeline runs instead |
| `initTimeoutMs` | number | `30000` | Max time to load the embedding model |
| `routeTimeoutMs` | number | `5000` | Max time per routing decision |
| `strategyWeights` | object | — | Override scoring weights (see below) |
| `blockedModels` | string[] | — | Model IDs to exclude from routing |
| `preferredProviders` | string[] | — | Prefer models from these providers |
| `preferredTier` | string | — | Prefer `frontier`, `mid`, `budget`, or `local` |

### Strategy weights

```json
{
  "strategyWeights": {
    "capability-match": 0.35,
    "complexity-tier-match": 0.25,
    "cost-optimization": 0.20,
    "latency-optimization": 0.10,
    "context-window-fit": 0.10
  }
}
```

## Commands

After installation, these commands are available in OpenClaw:

| Command | Routes to | Use for |
|---------|-----------|---------|
| `/simple` | Gemini 2.5 Flash | Quick facts, casual chat, follow-ups |
| `/cheap` | Gemini 2.5 Flash | Alias for /simple |
| `/coding` | Claude Sonnet 4.6 | Writing code, debugging, code review |
| `/creative` | Claude Sonnet 4.6 | Blog posts, emails, translation |
| `/action` | Claude Sonnet 4.6 | Tool calls, file operations |
| `/reason` | Gemini 2.5 Pro | Deep analysis, architecture, trade-offs |
| `/best` | Gemini 2.5 Pro | Alias for /reason |

Type a bare command (e.g., `/best`) to see help. Type with a message (e.g., `/best explain quantum computing`) to route that message.

Without a command prefix, the router automatically classifies your prompt and picks the best model.

## Customizing routes

Edit `src/config/routing.json` (or `dist/config/routing.json` after build) to:

- Add new commands: add an entry to `"commands"`
- Change which model handles a class: change the `"model"` field in `"classes"`
- Add a new class: add to `"classes"` and create a matching examples file in `examples/`

After editing, rebuild (`npm run build`) and restart the gateway.

## Verifying it works

After restarting the gateway, check the logs for:

```
Registered plugin command: /simple (plugin: smart-router)
Registered plugin command: /best (plugin: smart-router)
smart-router: registered 7 commands + hooks (message_received, before_model_resolve, before_prompt_build)
```

Send a test message:

```
/simple what model are you?
```

The response should come from Gemini 2.5 Flash.

## Troubleshooting

**"Unknown model" errors**: The plugin's model registry must match models configured in your OpenClaw instance. Check `src/models/registry.ts`.

**Rate limit errors**: Your API provider is throttling requests. Wait and retry, or switch the affected class to a different model in `routing.json`.

**Plugin not loading**: Verify the path in `plugins.load.paths` points to the directory containing `openclaw.plugin.json` and `index.js` (or `index.ts` for dev mode).

**Commands not appearing**: Check that `plugins.entries.smart-router.enabled` is `true` and restart the gateway.

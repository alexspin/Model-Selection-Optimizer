# Installing openclaw-smart-router

Smart model routing plugin for OpenClaw — dynamically selects the best AI model per conversation turn based on semantic prompt classification, required capabilities, cost, and latency.

## Prerequisites

- Node.js 20+
- OpenClaw 2026.3.x installed and configured
- At least one LLM provider API key (Anthropic and/or Google recommended)

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/alexspin/Model-Selection-Optimizer.git
cd Model-Selection-Optimizer
```

If the repo is private, use a personal access token:

```bash
git clone https://<your-github-token>@github.com/alexspin/Model-Selection-Optimizer.git
cd Model-Selection-Optimizer
```

### Step 2: Install dependencies and build

```bash
npm install
npm run build
```

This installs all dependencies (including the embedding model for semantic classification) and compiles TypeScript to JavaScript in the `dist/` directory.

Alternatively, use the guided setup script:

```bash
bash setup.sh
```

The setup script will install dependencies, build, show you the config to add, and optionally add model identity guidance to your workspace IDENTITY.md.

### Step 3: Add the plugin to your OpenClaw config

Open your OpenClaw config file. This is typically at `~/.openclaw/openclaw.json` or `.openclaw/openclaw.json` in your project directory.

Add the following to your config (merge into existing content — don't replace the whole file):

```json
{
  "plugins": {
    "entries": {
      "smart-router": {
        "enabled": true,
        "config": {
          "enabled": true,
          "logDecisions": true,
          "classificationThreshold": 0.35
        }
      }
    },
    "load": {
      "paths": ["/full/path/to/Model-Selection-Optimizer/dist/plugin"]
    }
  }
}
```

Replace `/full/path/to/Model-Selection-Optimizer` with the actual absolute path where you cloned the repo. For example:

```json
"paths": ["/home/alex/Model-Selection-Optimizer/dist/plugin"]
```

For development with TypeScript source (no build step needed, requires `tsx`):

```json
"paths": ["/home/alex/Model-Selection-Optimizer/src/plugin"]
```

### Step 4: Set your API keys

The plugin routes to models from multiple providers. Set the API keys as environment variables:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

Your OpenClaw config references these via `${GEMINI_API_KEY}` and `${ANTHROPIC_API_KEY}`. The gateway will fail to start if a referenced key is missing.

You can get a Gemini API key at https://aistudio.google.com/apikey and an Anthropic key at https://console.anthropic.com/.

### Step 5: Add model identity guidance (optional but recommended)

Add this section to your `.openclaw/workspace/IDENTITY.md` (create the file and directories if they don't exist):

```markdown
## Model Identity

This assistant uses smart model routing — different turns may be handled by different AI models. When asked what model you are, report your TRUE underlying model identity (e.g. Claude Sonnet, GPT-4o, Gemini Flash, etc.), not the configured default. If you genuinely do not know your own model name, say so honestly rather than guessing.
```

This tells the agent to honestly report which model is responding on each turn, which is useful for verifying routing decisions.

If you ran `bash setup.sh` in Step 2, it will have prompted you to add this automatically.

### Step 6: Restart the gateway

Restart your OpenClaw gateway. Check the logs for these lines confirming the plugin loaded:

```
Registered plugin command: /simple (plugin: smart-router)
Registered plugin command: /cheap (plugin: smart-router)
Registered plugin command: /coding (plugin: smart-router)
Registered plugin command: /creative (plugin: smart-router)
Registered plugin command: /action (plugin: smart-router)
Registered plugin command: /reason (plugin: smart-router)
Registered plugin command: /best (plugin: smart-router)
smart-router: registered 7 commands + hooks (message_received, before_model_resolve, before_prompt_build)
```

You may also see this warning — it's harmless and does not affect functionality:

```
plugin smart-router: plugin id mismatch (manifest uses "smart-router", entry hints "plugin")
```

### Step 7: Test it

Send a test message through your OpenClaw interface:

```
/simple what model are you?
```

The response should come from Gemini 2.5 Flash.

```
/coding write a function to reverse a string
```

The response should come from Claude Sonnet 4.6.

Without a command prefix, the router automatically classifies your prompt and picks the best model:

```
write some code to parse a CSV file
```

Check the gateway logs for routing decisions:

```
[SmartRouter] Classifications: coding(0.79)
[SmartRouter] Selected: anthropic/claude-sonnet-4-6 | Score: 0.937 | Strategy: weighted-scoring
smart-router: routed to anthropic/claude-sonnet-4-6 (class=coding, config-mapped)
```

## Configuration

All options can be set in `.openclaw/openclaw.json` under `plugins.entries.smart-router.config`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the router |
| `logDecisions` | boolean | `true` | Log which model was selected and why |
| `fallbackModel` | string | `anthropic/claude-sonnet-4-6` | Model to use if routing fails |
| `classificationThreshold` | number | `0.35` | Confidence cutoff (0.1-0.9) for direct class-to-model routing. Below this, the scoring pipeline runs instead |
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

## Customizing routes

Edit `src/config/routing.json` (or `dist/config/routing.json` after build) to:

- Add new commands: add an entry to `"commands"`
- Change which model handles a class: change the `"model"` field in `"classes"`
- Add a new class: add to `"classes"` and create a matching examples file in `examples/`

After editing, rebuild (`npm run build`) and restart the gateway.

## Troubleshooting

**Gateway fails to start with "Missing env var"**: Your OpenClaw config references an API key that isn't set. Set the required environment variables (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) before starting the gateway.

**"plugin not found: smart-router"**: The `load.paths` entry is missing or points to the wrong directory. Make sure it points to the directory containing `openclaw.plugin.json` — that's `dist/plugin` (built) or `src/plugin` (dev mode).

**"plugin path not found"**: The path in `load.paths` doesn't exist on disk. Use the full absolute path and verify the directory exists.

**"plugin id mismatch" warning**: Harmless. OpenClaw derives an ID hint from the directory name; the plugin manifest uses "smart-router". Does not affect functionality.

**No `dist/` directory**: Run `npm run build` from the plugin root to compile TypeScript to JavaScript.

**npm install from git missing dependencies**: Installing via `npm install github:...` does not install the plugin's own dependencies. Clone the repo and run `npm install` inside it instead.

**"Unknown model" errors**: The plugin's model registry must match models configured in your OpenClaw instance. Check `src/models/registry.ts`.

**Rate limit errors**: Your API provider is throttling requests. Wait and retry, or switch the affected class to a different model in `routing.json`.

**Commands not appearing**: Check that `plugins.entries.smart-router.enabled` is `true` and restart the gateway.

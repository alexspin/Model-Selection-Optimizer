# Installing openclaw-smart-router

Smart model routing plugin for OpenClaw — dynamically selects the best AI model per conversation turn based on semantic prompt classification, required capabilities, cost, and latency.

## Prerequisites

- Node.js 20+
- OpenClaw 2026.3.x installed and configured
- At least one LLM provider API key (Anthropic and/or Google recommended)

## Installation from Git

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

## Installation from a zip file

If you received this as a zip package instead of cloning from Git, follow these steps.

### Step 1: Unzip to the right location

Unzip the package **next to** your OpenClaw workspace directory (not inside it). For example, if your OpenClaw workspace is at `~/my-project`, your directory structure should look like:

```
~/my-project/
  .openclaw/           <-- your OpenClaw config lives here
  Model-Selection-Optimizer/   <-- unzip the plugin here
    src/
    package.json
    ...
```

On macOS/Linux:

```bash
cd ~/my-project
unzip Model-Selection-Optimizer.zip
```

On Windows, right-click the zip file and choose "Extract All", then move the extracted folder next to your `.openclaw/` directory.

### Step 2: Install dependencies

Open a terminal, navigate into the plugin folder, and install:

```bash
cd Model-Selection-Optimizer
npm install
```

This downloads all the packages the plugin needs. It may take a minute — the semantic classifier downloads a small embedding model on first install.

### Step 3: Build

```bash
npm run build
```

This compiles the TypeScript source code into JavaScript in the `dist/` folder. You should see:

```
Assets copied to dist/
```

If you see errors, make sure you have Node.js 20 or newer installed (`node --version` to check).

### Step 4: Note the full path

You'll need the full path to the plugin's `dist/plugin` directory for the next step. Run this to get it:

```bash
pwd
```

For example, if it prints `/home/alex/my-project/Model-Selection-Optimizer`, then the path you need is:

```
/home/alex/my-project/Model-Selection-Optimizer/dist/plugin
```

Continue to the next section ("Add the plugin to your OpenClaw config") using this path.

## Configure the plugin

Whether you installed from Git or a zip file, the remaining steps are the same.

### Add the plugin to your OpenClaw config

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

## Adding a new model

To add a new model to the routing mix, you need to update two files in the plugin and make sure the model is available in your OpenClaw config.

### Step 1: Add the model to the plugin's registry

Open `src/models/registry.ts` and add a new entry to the `builtInModels` array. Here's an example adding GPT-4o-mini:

```typescript
{
  id: "openai/gpt-4o-mini",
  provider: "openai",
  modelId: "gpt-4o-mini",
  displayName: "GPT-4o Mini",
  tier: "budget",                    // "budget", "mid", "frontier", or "local"
  capabilities: [
    "text-generation", "code-generation", "reasoning",
    "summarization", "function-calling",
  ],
  contextWindow: 128000,
  maxOutputTokens: 16384,
  pricing: { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.60 },
  averageLatencyMs: 500,
  qualityScores: {
    "text-generation": 0.80, "code-generation": 0.75, "reasoning": 0.70,
    "summarization": 0.78, "translation": 0.75, "creative-writing": 0.72,
    "data-analysis": 0.70, "function-calling": 0.78, "vision": 0.0, "long-context": 0.75,
  },
  isLocal: false,
  enabled: true,
},
```

Key fields explained:

| Field | What it does |
|-------|-------------|
| `id` | Must be `provider/model-name` format. This is what the router uses to identify the model |
| `provider` | Must match the provider name in your OpenClaw config (e.g., `openai`, `anthropic`, `google`) |
| `modelId` | The actual model ID the API expects (e.g., `gpt-4o-mini`, `claude-sonnet-4-6`) |
| `tier` | Controls complexity matching. `budget` models get picked for simple tasks, `frontier` for complex ones, `mid` for everything in between |
| `capabilities` | What the model can do. The scoring engine matches these against what the prompt needs |
| `qualityScores` | 0.0 to 1.0 rating for each capability. Higher scores make the model more likely to be picked for that type of task |
| `pricing` | Cost per million tokens. The cost-optimization strategy uses this to prefer cheaper models when quality is similar |
| `averageLatencyMs` | Typical response time. The latency strategy uses this |
| `enabled` | Set to `false` to keep the model in the registry but exclude it from routing |

### Step 2: Map the model to a class in routing config

Open `src/config/routing.json` and change which model a class uses. For example, to make `/simple` and `/cheap` use GPT-4o-mini instead of Gemini Flash:

```json
"simple": {
  "description": "Quick facts, follow-ups, casual chat, acknowledgments, short summaries",
  "model": "openai/gpt-4o-mini",
  "examples": "simple.json",
  "capabilities": ["text-generation"],
  "outputScale": "short"
}
```

The `model` value must match the `id` you used in the registry.

The `/simple` and `/cheap` commands both point to the `simple` class, so changing the model here updates both commands automatically.

### Step 3: Make sure OpenClaw can call the model

The plugin picks the model, but OpenClaw makes the actual API call. The model's provider needs to be configured in your `openclaw.json` with a valid API key.

If OpenClaw's built-in catalog already knows the model (most OpenAI and Anthropic models), you just need the API key set:

```bash
export OPENAI_API_KEY="your-key-here"
```

If it's a custom or less common model, you may need to add the provider to your `openclaw.json` under `models.providers`, similar to how the Google provider is configured.

### Step 4: Rebuild and restart

```bash
npm run build
```

Then restart your OpenClaw gateway. Check the logs to confirm the model is being selected:

```
[SmartRouter] Selected: openai/gpt-4o-mini | Score: 0.932 | Strategy: weighted-scoring
smart-router: routed to openai/gpt-4o-mini (class=simple, config-mapped)
```

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

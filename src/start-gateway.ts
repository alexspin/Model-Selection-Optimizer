import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, "..");
const DEFAULT_PORT = 18789;

function getOpenclawHome(): string {
  return process.env.OPENCLAW_HOME || process.env.HOME || "/home/runner";
}

function getConfigPath(): string {
  return join(getOpenclawHome(), ".openclaw", "openclaw.json");
}

function getPort(): number {
  try {
    const config = JSON.parse(readFileSync(getConfigPath(), "utf-8"));
    return config.gateway?.port || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function startGateway(): void {
  if (!process.env.OPENCLAW_HOME) {
    process.env.OPENCLAW_HOME = PROJECT_ROOT;
    console.log(`OPENCLAW_HOME not set, using project root: ${PROJECT_ROOT}`);
  }

  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    console.error(`OpenClaw config not found at ${configPath}`);
    console.error(`Ensure .openclaw/openclaw.json exists in your project.`);
    process.exit(1);
  }

  const hasAnyKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );

  if (!hasAnyKey) {
    console.error("No API keys configured. Set at least one provider API key.");
    console.error("Run: npm run setup — to see what's needed.");
    process.exit(1);
  }

  const port = getPort();
  console.log(`Starting OpenClaw gateway on port ${port}...`);
  console.log(`OPENCLAW_HOME=${process.env.OPENCLAW_HOME}`);
  console.log(`Config: ${configPath}`);

  const gateway = spawn("npx", ["openclaw", "gateway", "run", "--port", String(port), "--verbose"], {
    stdio: "inherit",
    env: { ...process.env },
  });

  gateway.on("error", (err) => {
    console.error("Failed to start gateway:", err.message);
    process.exit(1);
  });

  gateway.on("exit", (code) => {
    console.log(`Gateway exited with code ${code}`);
    process.exit(code || 0);
  });

  process.on("SIGINT", () => {
    gateway.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    gateway.kill("SIGTERM");
  });
}

startGateway();

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
const DEFAULT_PORT = 18789;

function getPort(): number {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return config.gateway?.port || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function startGateway(): void {
  if (!existsSync(CONFIG_PATH)) {
    console.error("OpenClaw config not found. Run: npm run setup");
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

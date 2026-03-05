import { spawn } from "child_process";
import { existsSync, readFileSync, mkdirSync, copyFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
const DEFAULT_PORT = 18789;
const PROJECT_ROOT = join(__dirname, "..");
const PROJECT_CONFIG_DIR = join(PROJECT_ROOT, "config");

function ensureConfig(): void {
  if (!existsSync(PROJECT_CONFIG_DIR)) {
    console.warn(`Config template dir not found: ${PROJECT_CONFIG_DIR}`);
    return;
  }

  const openclawDir = join(homedir(), ".openclaw");
  const workspaceDir = join(openclawDir, "workspace");
  const agentDir = join(openclawDir, "agents", "main", "agent");

  const copies: [string, string][] = [
    [join(PROJECT_CONFIG_DIR, "openclaw", "openclaw.json"), join(openclawDir, "openclaw.json")],
    [join(PROJECT_CONFIG_DIR, "agent", "auth-profiles.json"), join(agentDir, "auth-profiles.json")],
    [join(PROJECT_CONFIG_DIR, "workspace", "IDENTITY.md"), join(workspaceDir, "IDENTITY.md")],
    [join(PROJECT_CONFIG_DIR, "workspace", "SOUL.md"), join(workspaceDir, "SOUL.md")],
  ];

  for (const [src, dest] of copies) {
    if (!existsSync(src)) {
      console.warn(`Config template missing: ${src}`);
      continue;
    }
    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      console.log(`Installed config: ${dest}`);
    }
  }
}

function getPort(): number {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return config.gateway?.port || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function startGateway(): void {
  ensureConfig();

  if (!existsSync(CONFIG_PATH)) {
    console.error("OpenClaw config not found. Run: npm run install-config");
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

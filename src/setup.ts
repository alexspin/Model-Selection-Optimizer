import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");

interface OpenClawConfig {
  gateway: { mode: string; port: number; auth: { mode: string } };
  agents: { defaults: { workspace: string; model: { primary: string } } };
  models: { mode: string; providers: Record<string, unknown> };
}

function readConfig(): OpenClawConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`OpenClaw config not found at ${CONFIG_PATH}. Run: npx openclaw setup`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(config: OpenClawConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function checkEnvKeys(): Record<string, boolean> {
  const keys: Record<string, string> = {
    ANTHROPIC_API_KEY: "Anthropic (Claude)",
    OPENAI_API_KEY: "OpenAI (GPT)",
    GOOGLE_API_KEY: "Google (Gemini)",
    OPENROUTER_API_KEY: "OpenRouter (multi-provider)",
  };

  const results: Record<string, boolean> = {};
  console.log("\n=== API Key Status ===");
  for (const [envVar, label] of Object.entries(keys)) {
    const present = !!process.env[envVar];
    results[envVar] = present;
    console.log(`  ${present ? "✓" : "✗"} ${label} (${envVar}): ${present ? "configured" : "not set"}`);
  }
  return results;
}

function checkOpenClawInstall(): boolean {
  try {
    const version = execSync("npx openclaw --version 2>&1", { encoding: "utf-8" }).trim();
    console.log(`\n=== OpenClaw ===`);
    console.log(`  Version: ${version}`);
    return true;
  } catch {
    console.log("  ✗ OpenClaw CLI not found");
    return false;
  }
}

function checkConfig(): boolean {
  try {
    const config = readConfig();
    console.log(`\n=== Configuration ===`);
    console.log(`  Config path: ${CONFIG_PATH}`);
    console.log(`  Gateway mode: ${config.gateway.mode}`);
    console.log(`  Gateway port: ${config.gateway.port}`);
    console.log(`  Primary model: ${config.agents.defaults.model.primary}`);
    console.log(`  Workspace: ${config.agents.defaults.workspace}`);
    return true;
  } catch (err) {
    console.log(`  ✗ Config error: ${err}`);
    return false;
  }
}

function validateConfig(): boolean {
  try {
    const output = execSync("npx openclaw config validate 2>&1", { encoding: "utf-8" });
    console.log(`\n=== Config Validation ===`);
    console.log(`  ✓ ${output.split("\n").pop()?.trim()}`);
    return true;
  } catch (err: any) {
    console.log(`\n=== Config Validation ===`);
    console.log(`  ✗ Validation failed: ${err.stdout || err.message}`);
    return false;
  }
}

function printSetupInstructions(keyStatus: Record<string, boolean>): void {
  const missingKeys = Object.entries(keyStatus)
    .filter(([, present]) => !present)
    .map(([key]) => key);

  if (missingKeys.length === Object.keys(keyStatus).length) {
    console.log("\n=== Setup Required ===");
    console.log("  No API keys are configured. You need at least one provider.");
    console.log("  Set environment variables for the providers you want to use:");
    console.log("");
    for (const key of missingKeys) {
      console.log(`  export ${key}="your-key-here"`);
    }
    console.log("");
    console.log("  Tip: In Replit, use the Secrets tab to set environment variables.");
  } else if (missingKeys.length > 0) {
    console.log("\n=== Optional: Additional Providers ===");
    console.log("  You can add more providers by setting these environment variables:");
    for (const key of missingKeys) {
      console.log(`    ${key}`);
    }
  }
}

function main(): void {
  console.log("====================================");
  console.log("  OpenClaw Smart Router — Setup Check");
  console.log("====================================");

  const installed = checkOpenClawInstall();
  if (!installed) {
    console.log("\n  Run: npm install openclaw");
    process.exit(1);
  }

  const configOk = checkConfig();
  const validConfig = configOk && validateConfig();
  const keyStatus = checkEnvKeys();

  const hasAnyKey = Object.values(keyStatus).some(Boolean);

  console.log("\n=== Overall Status ===");
  console.log(`  OpenClaw installed: ✓`);
  console.log(`  Config valid: ${validConfig ? "✓" : "✗"}`);
  console.log(`  API keys configured: ${hasAnyKey ? "✓ (at least one)" : "✗ (none)"}`);
  console.log(`  Ready to start gateway: ${validConfig && hasAnyKey ? "✓" : "✗"}`);

  if (!hasAnyKey) {
    printSetupInstructions(keyStatus);
  }

  if (validConfig && hasAnyKey) {
    console.log("\n=== Ready! ===");
    console.log("  Start the gateway:  npx openclaw gateway run --port 18789 --verbose");
    console.log("  Run the router demo: npm run dev");
    console.log("  Send a test message: npx openclaw agent --message 'Hello' --thinking high");
  }
}

main();

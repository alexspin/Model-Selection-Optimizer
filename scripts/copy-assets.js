import { cpSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

mkdirSync(join(dist, "config", "examples"), { recursive: true });
mkdirSync(join(dist, "plugin"), { recursive: true });

cpSync(join(root, "src", "config", "routing.json"), join(dist, "config", "routing.json"));
cpSync(join(root, "src", "config", "examples"), join(dist, "config", "examples"), { recursive: true });
cpSync(join(root, "src", "plugin", "openclaw.plugin.json"), join(dist, "plugin", "openclaw.plugin.json"));

console.log("Assets copied to dist/");

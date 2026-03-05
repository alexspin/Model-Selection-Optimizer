#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="openclaw-smart-router"
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

info()  { echo -e "${GREEN}✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $1"; }
fail()  { echo -e "${RED}✗${RESET} $1"; exit 1; }
step()  { echo -e "\n${BOLD}$1${RESET}"; }

echo -e "${BOLD}${PLUGIN_NAME} — installer${RESET}\n"

# --- Detect OpenClaw ---
step "1. Detecting OpenClaw installation"

OPENCLAW_BIN=""
if command -v openclaw &>/dev/null; then
  OPENCLAW_BIN="openclaw"
elif npx --yes openclaw --version &>/dev/null 2>&1; then
  OPENCLAW_BIN="npx openclaw"
fi

if [ -n "$OPENCLAW_BIN" ]; then
  OC_VERSION=$($OPENCLAW_BIN --version 2>/dev/null || echo "unknown")
  info "Found OpenClaw: $OC_VERSION"
else
  warn "OpenClaw CLI not found (not required, but recommended)"
fi

# --- Detect config directory ---
step "2. Locating OpenClaw config"

CONFIG_DIR=""
if [ -n "${OPENCLAW_HOME:-}" ] && [ -d "$OPENCLAW_HOME/.openclaw" ]; then
  CONFIG_DIR="$OPENCLAW_HOME/.openclaw"
elif [ -d "./.openclaw" ]; then
  CONFIG_DIR="$(pwd)/.openclaw"
elif [ -d "$HOME/.openclaw" ]; then
  CONFIG_DIR="$HOME/.openclaw"
fi

if [ -n "$CONFIG_DIR" ]; then
  info "Config directory: $CONFIG_DIR"
else
  warn "No .openclaw directory found"
  echo "  Create one with: mkdir -p .openclaw && echo '{}' > .openclaw/openclaw.json"
fi

# --- Install dependencies ---
step "3. Installing dependencies"

if [ -f "package.json" ]; then
  npm install --ignore-scripts 2>/dev/null
  info "Dependencies installed"
else
  fail "No package.json found. Run this script from the plugin root directory."
fi

# --- Build ---
step "4. Building plugin"

npm run build 2>/dev/null
info "Plugin built to dist/"

# --- Determine plugin path ---
PLUGIN_DIR="$(pwd)/dist/plugin"
PLUGIN_SRC_DIR="$(pwd)/src/plugin"

step "5. Plugin registration"

if [ -n "$CONFIG_DIR" ] && [ -f "$CONFIG_DIR/openclaw.json" ]; then
  echo ""
  echo "  Add the following to your ${BOLD}.openclaw/openclaw.json${RESET}:"
  echo ""
  echo -e "  ${DIM}// For compiled JS (recommended for production):${RESET}"
  echo "  \"plugins\": {"
  echo "    \"entries\": {"
  echo "      \"smart-router\": {"
  echo "        \"enabled\": true,"
  echo "        \"config\": {"
  echo "          \"enabled\": true,"
  echo "          \"logDecisions\": true"
  echo "        }"
  echo "      }"
  echo "    },"
  echo "    \"load\": {"
  echo "      \"paths\": [\"$PLUGIN_DIR\"]"
  echo "    }"
  echo "  }"
  echo ""
  echo -e "  ${DIM}// For TypeScript source (development, requires tsx):${RESET}"
  echo -e "  ${DIM}// \"paths\": [\"$PLUGIN_SRC_DIR\"]${RESET}"
else
  echo ""
  echo "  No openclaw.json found. Create .openclaw/openclaw.json with the plugin config."
fi

# --- Patch IDENTITY.md ---
step "6. Workspace identity guidance"

IDENTITY_BLOCK='## Model Identity

This assistant uses smart model routing — different turns may be handled by different AI models. When asked what model you are, report your TRUE underlying model identity (e.g. Claude Sonnet, GPT-4o, Gemini Flash, etc.), not the configured default. If you genuinely do not know your own model name, say so honestly rather than guessing.'

if [ -n "$CONFIG_DIR" ]; then
  WORKSPACE_DIR="$CONFIG_DIR/workspace"
  IDENTITY_FILE="$WORKSPACE_DIR/IDENTITY.md"

  if [ -f "$IDENTITY_FILE" ] && grep -q "## Model Identity" "$IDENTITY_FILE"; then
    info "Model Identity guidance already present in IDENTITY.md — skipping"
  else
    echo ""
    echo "  The smart-router plugin works best when the agent knows to report"
    echo "  its true model identity. This adds the following to IDENTITY.md:"
    echo ""
    echo -e "  ${DIM}## Model Identity"
    echo -e "  This assistant uses smart model routing — different turns may be"
    echo -e "  handled by different AI models. When asked what model you are,"
    echo -e "  report your TRUE underlying model identity...${RESET}"
    echo ""
    read -rp "  Add Model Identity guidance to IDENTITY.md? [y/N] " REPLY
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
      mkdir -p "$WORKSPACE_DIR"
      if [ ! -f "$IDENTITY_FILE" ]; then
        echo "# IDENTITY.md" > "$IDENTITY_FILE"
        echo "" >> "$IDENTITY_FILE"
      fi
      echo "" >> "$IDENTITY_FILE"
      echo "$IDENTITY_BLOCK" >> "$IDENTITY_FILE"
      info "Added Model Identity guidance to $IDENTITY_FILE"
    else
      warn "Skipped — you can add it manually later (see INSTALL.md)"
    fi
  fi
else
  warn "No .openclaw directory found — skipping IDENTITY.md setup"
fi

# --- Verify ---
step "7. Verification"

if [ -f "dist/plugin/index.js" ] && [ -f "dist/plugin/openclaw.plugin.json" ]; then
  info "Plugin entry: dist/plugin/index.js"
  info "Plugin manifest: dist/plugin/openclaw.plugin.json"
  info "Routing config: dist/config/routing.json"
  info "Example prompts: dist/config/examples/"
else
  fail "Build output missing. Check for errors above."
fi

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${RESET}"
echo ""
echo "  Next steps:"
echo "  1. Add the plugin config to .openclaw/openclaw.json (see above)"
echo "  2. Ensure you have at least one provider API key set"
echo "     (GOOGLE_API_KEY for Gemini, ANTHROPIC_API_KEY for Claude)"
echo "  3. Restart your OpenClaw gateway"
echo "  4. Try: /simple hello  or  /best explain something complex"
echo ""
echo "  Commands registered by this plugin:"
echo "    /simple  /cheap   — Budget tier (Gemini 2.5 Flash)"
echo "    /coding           — Code tier (Claude Sonnet 4.6)"
echo "    /creative         — Creative tier (Claude Sonnet 4.6)"
echo "    /action           — Action tier (Claude Sonnet 4.6)"
echo "    /reason  /best    — Reasoning tier (Gemini 2.5 Pro)"
echo ""

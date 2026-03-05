#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_DIR/config"
OPENCLAW_DIR="$HOME/.openclaw"

echo "Installing OpenClaw config from $CONFIG_DIR -> $OPENCLAW_DIR"

mkdir -p "$OPENCLAW_DIR"
mkdir -p "$OPENCLAW_DIR/workspace"
mkdir -p "$OPENCLAW_DIR/agents/main/agent"

cp "$CONFIG_DIR/openclaw/openclaw.json" "$OPENCLAW_DIR/openclaw.json"
echo "  -> openclaw.json"

cp "$CONFIG_DIR/agent/auth-profiles.json" "$OPENCLAW_DIR/agents/main/agent/auth-profiles.json"
echo "  -> auth-profiles.json"

cp "$CONFIG_DIR/workspace/IDENTITY.md" "$OPENCLAW_DIR/workspace/IDENTITY.md"
echo "  -> IDENTITY.md"

cp "$CONFIG_DIR/workspace/SOUL.md" "$OPENCLAW_DIR/workspace/SOUL.md"
echo "  -> SOUL.md"

echo "Done. Config installed to $OPENCLAW_DIR"

#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RESET='\033[0m'

AGENT="main"
TIMEOUT=60

send() {
  local label="$1"
  local message="$2"
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${YELLOW}TEST: ${label}${RESET}"
  echo -e "${CYAN}Message: ${message}${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  npx openclaw agent \
    --agent "$AGENT" \
    --message "$message" \
    --timeout "$TIMEOUT" 2>&1 | grep -v "^Config warnings" | grep -v "^\[plugins\]" || true
  echo ""
}

echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║     Smart Router — Routing Verification Test     ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

echo -e "${BOLD}${GREEN}── PART 1: Slash command routing ──${RESET}"

send "1/6 — /simple → expect Gemini Flash" \
  "/simple What is 2+2? Also, what model are you? State your exact model name."

send "2/6 — /coding → expect Claude Sonnet" \
  "/coding Write a Python function that reverses a linked list. Also, what model are you? State your exact model name."

send "3/6 — /reason → expect Gemini Pro" \
  "/reason Compare microservices vs monoliths for a small startup. Also, what model are you?"

echo -e "${BOLD}${GREEN}── PART 2: Semantic classification (no slash command) ──${RESET}"

send "4/6 — simple class (casual question)" \
  "Hey, what is the capital of France? Also, what model are you?"

send "5/6 — coding class (code task)" \
  "Write a TypeScript function that debounces an async callback with a configurable delay. Also, what model are you? State your exact model name."

send "6/6 — creative class (writing task)" \
  "Write a short poem about a cat who learned to code. Also, what model are you? State your exact model name."

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║              All 6 tests complete                ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${RESET}"

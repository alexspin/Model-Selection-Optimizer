import type { RouterConfig } from "../types/index.js";

export const defaultRouterConfig: RouterConfig = {
  strategies: [
    { name: "capability-match", weight: 0.35, enabled: true, params: {} },
    { name: "complexity-tier-match", weight: 0.25, enabled: true, params: {} },
    { name: "cost-optimization", weight: 0.20, enabled: true, params: {} },
    { name: "latency-optimization", weight: 0.10, enabled: true, params: {} },
    { name: "context-window-fit", weight: 0.10, enabled: true, params: {} },
  ],
  fallbackModel: "anthropic/claude-sonnet-4-6",
  enableMetaRouting: false,
  metaRoutingModel: "openai/gpt-4o-mini",
  budgetDefaults: {
    maxCostPerTurn: 0.50,
    maxCostPerSession: 5.00,
    currentSessionCost: 0,
    preferCheaper: false,
  },
  logging: true,
};

export function createRouterConfig(overrides: Partial<RouterConfig> = {}): RouterConfig {
  return {
    ...defaultRouterConfig,
    ...overrides,
    strategies: overrides.strategies || defaultRouterConfig.strategies,
    budgetDefaults: {
      ...defaultRouterConfig.budgetDefaults,
      ...(overrides.budgetDefaults || {}),
    },
  };
}

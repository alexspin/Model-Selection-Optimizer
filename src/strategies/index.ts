export { capabilityStrategy } from "./capability-strategy.js";
export { costStrategy, estimateCost } from "./cost-strategy.js";
export { latencyStrategy } from "./latency-strategy.js";
export { complexityStrategy } from "./complexity-strategy.js";
export { contextWindowStrategy } from "./context-window-strategy.js";

import type { RoutingStrategy } from "../types/index.js";
import { capabilityStrategy } from "./capability-strategy.js";
import { costStrategy } from "./cost-strategy.js";
import { latencyStrategy } from "./latency-strategy.js";
import { complexityStrategy } from "./complexity-strategy.js";
import { contextWindowStrategy } from "./context-window-strategy.js";

export const allStrategies: RoutingStrategy[] = [
  capabilityStrategy,
  costStrategy,
  latencyStrategy,
  complexityStrategy,
  contextWindowStrategy,
];

export function getStrategyByName(name: string): RoutingStrategy | undefined {
  return allStrategies.find((s) => s.name === name);
}

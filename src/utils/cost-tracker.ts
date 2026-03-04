import type { ConversationTurn, BudgetConstraint } from "../types/index.js";

export class CostTracker {
  private turns: ConversationTurn[] = [];
  private sessionCosts: Map<string, number> = new Map();

  recordTurn(sessionId: string, turn: ConversationTurn): void {
    this.turns.push(turn);
    const current = this.sessionCosts.get(sessionId) || 0;
    this.sessionCosts.set(sessionId, current + (turn.costIncurred || 0));
  }

  getSessionCost(sessionId: string): number {
    return this.sessionCosts.get(sessionId) || 0;
  }

  getTotalCost(): number {
    return Array.from(this.sessionCosts.values()).reduce((sum, c) => sum + c, 0);
  }

  getBudgetRemaining(sessionId: string, budget: BudgetConstraint): number {
    const spent = this.getSessionCost(sessionId);
    return Math.max(0, budget.maxCostPerSession - spent);
  }

  getModelUsageBreakdown(): Record<string, { turns: number; cost: number }> {
    const breakdown: Record<string, { turns: number; cost: number }> = {};
    for (const turn of this.turns) {
      if (!turn.modelUsed) continue;
      if (!breakdown[turn.modelUsed]) {
        breakdown[turn.modelUsed] = { turns: 0, cost: 0 };
      }
      breakdown[turn.modelUsed].turns++;
      breakdown[turn.modelUsed].cost += turn.costIncurred || 0;
    }
    return breakdown;
  }

  getSummary(): string {
    const breakdown = this.getModelUsageBreakdown();
    const lines = [
      `Total cost: $${this.getTotalCost().toFixed(4)}`,
      `Total turns: ${this.turns.length}`,
      `Sessions: ${this.sessionCosts.size}`,
      "",
      "Model usage:",
    ];
    for (const [model, stats] of Object.entries(breakdown)) {
      lines.push(`  ${model}: ${stats.turns} turns, $${stats.cost.toFixed(4)}`);
    }
    return lines.join("\n");
  }
}

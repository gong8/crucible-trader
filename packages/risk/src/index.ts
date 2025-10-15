/**
 * Represents the risk limits enforced during Phase 0 scaffolding.
 */
export interface RiskLimits {
  readonly maxDailyLossPct: number;
  readonly maxPositionPct: number;
  readonly orderCap: number;
  readonly killSwitchDrawdownPct: number;
  readonly cooldownMinutes: number;
}

/**
 * Returns the default risk limits defined for Phase 0.
 */
export const createDefaultRiskLimits = (): RiskLimits => {
  return {
    maxDailyLossPct: 3,
    maxPositionPct: 20,
    orderCap: 10,
    killSwitchDrawdownPct: 5,
    cooldownMinutes: 15,
  };
};

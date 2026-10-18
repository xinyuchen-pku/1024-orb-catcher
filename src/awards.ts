export const AWARD_THRESHOLDS = { silver: 35, gold: 50 } as const;
export function awardForScore(score: number): 'gold' | 'silver' | null {
  if (!Number.isFinite(score)) return null;
  if (score >= AWARD_THRESHOLDS.gold) return 'gold';
  if (score >= AWARD_THRESHOLDS.silver) return 'silver';
  return null;
}

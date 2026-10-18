import type { Hand } from './roundFlow';

interface Category { categoryName: string; score: number }

// The current Tasks Vision model already labels the player's anatomical hand.
// Mirror only the displayed video and cursor X; never swap semantic hand labels.
export function selectTrackedHand(categories: Category[][]): { selected: number; hand: Hand } {
  const hands: Hand[] = categories.map(items => {
    const best = items[0];
    if (!best || !Number.isFinite(best.score) || best.score < 0.7) return 'Unknown';
    return best.categoryName === 'Left' || best.categoryName === 'Right' ? best.categoryName : 'Unknown';
  });
  const right = hands.indexOf('Right');
  const selected = right >= 0 ? right : 0;
  return { selected, hand: hands[selected] ?? 'Unknown' };
}

export interface Entry { name: string; score: number; at: number; id: string }
export const BOARD_KEY = '1024_star_catcher_v1';
export function rank(entries: Entry[]): Entry[] {
  return entries.filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score) && e.score >= 0 && Number.isFinite(e.at) && typeof e.id === 'string')
    .sort((a, b) => b.score - a.score || a.at - b.at).slice(0, 10);
}
export function readBoard(): Entry[] {
  try { const data = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]'); return Array.isArray(data) ? rank(data) : []; } catch { return []; }
}
export function saveBoard(entries: Entry[]): boolean {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(rank(entries))); return true; } catch { return false; }
}

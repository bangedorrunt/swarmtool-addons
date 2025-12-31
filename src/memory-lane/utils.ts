import { MemoryType } from './taxonomy';

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Detect intent from query for type boosting
 */
export function detectIntent(query: string): MemoryType[] {
  if (!query) return [];

  const q = query.toLowerCase();
  const boosts: MemoryType[] = [];

  if (q.includes('mistake') || q.includes('wrong') || q.includes('error')) {
    boosts.push('correction', 'gap');
  }
  if (q.includes('decided') || q.includes('chose') || q.includes('choice')) {
    boosts.push('decision');
  }
  if (q.includes('pattern') || q.includes('usually') || q.includes('habit')) {
    boosts.push('pattern_seed', 'commitment');
  }
  if (q.includes('learned') || q.includes('realized')) {
    boosts.push('learning', 'insight');
  }

  return boosts;
}

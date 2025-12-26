/**
 * Memory Lane Taxonomy
 *
 * Defines the types and priorities for persistent memories.
 */

import { z } from 'zod';

export const MemoryTypeSchema = z.enum([
  'correction', // User behavior correction (High)
  'decision', // Explicit choice (High)
  'commitment', // User preference/commitment (High)
  'insight', // Non-obvious discovery (Medium)
  'learning', // New knowledge (Medium)
  'confidence', // Strong signal (Medium)
  'pattern_seed', // Repeated behavior (Lower)
  'cross_agent', // Relevant to other agents (Lower)
  'workflow_note', // Process observation (Lower)
  'gap', // Missing capability (Lower)
]);

export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export interface EntityReference {
  type: 'person' | 'project' | 'business' | 'feature' | 'agent' | 'other';
  raw: string;
  slug: string;
  resolved: boolean;
}

/**
 * Metadata packed into the standard Memory.metadata column
 */
export const MemoryLaneMetadataSchema = z.object({
  lane_version: z.string(),
  memory_type: MemoryTypeSchema,
  entity_slugs: z.array(z.string()).default([]),
  entities: z.array(z.any()).default([]), // EntityReference[]
  confidence_score: z.number().min(0).max(100).default(70),
  source_chunk: z.string().optional(),
  tags: z.array(z.string()).optional(),
  feedback_score: z.number().optional().default(1.0),
  feedback_count: z.number().optional().default(0),
});

export type MemoryLaneMetadata = z.infer<typeof MemoryLaneMetadataSchema>;

export const PRIORITY_WEIGHTS: Record<MemoryType, number> = {
  correction: 1.0,
  decision: 1.0,
  commitment: 1.0,
  insight: 0.7,
  learning: 0.7,
  confidence: 0.7,
  pattern_seed: 0.4,
  cross_agent: 0.4,
  workflow_note: 0.4,
  gap: 0.4,
};

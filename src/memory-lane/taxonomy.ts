/**
 * Memory Lane Taxonomy
 *
 * Defines the types and priorities for persistent memories.
 *
 * SCHEMA COMPARISON ANALYSIS (swarmtool-addons-gfoxls-mjnz24b261l)
 * ===================================================================
 *
 * This file defines the metadata structure used by Memory Lane, which differs
 * significantly from the opencode-swarm-plugin's 'cells' table schema.
 *
 * METADATA STORAGE:
 * ---------------
 * Memory Lane metadata is packed into the standard 'memories' table's 'metadata'
 * column as JSONB (see MemoryLaneMetadataSchema below).
 *
 * METADATA STRUCTURE vs PLUGIN CELLS TABLE:
 * --------------------------------------
 *
 * Memory Lane (this taxonomy):
 * | Field               | Type            | Purpose                               |
 * |---------------------|-----------------|---------------------------------------|
 * | lane_version        | string          | Version tracking for schema evolution    |
 * | memory_type        | MemoryType enum  | Classification (correction, decision...)|
 * | entity_slugs       | string[]        | Entity references for filtering         |
 * | entities           | EntityReference[]| Rich entity metadata (type, raw, slug)|
 * | confidence_score   | number (0-100)  | Extraction confidence                  |
 * | source_chunk       | string?         | Verbatim transcript excerpt            |
 * | tags              | string[]?       | Manual/automatic classification tags   |
 * | feedback_score     | number?         | User feedback signal (default 1.0)    |
 * | feedback_count     | number?         | How many feedback events received     |
 *
 * Plugin's 'cells' table (NOT visible here - separate system):
 * | Purpose: Hive/bead tracking for swarm coordination               |
 * | Fields: bead_id, status, priority, type, parent_id, etc.       |
 * | No metadata JSONB structure - flat columns for task tracking    |
 *
 * KEY DIFFERENCES:
 * --------------
 *
 * 1. STRUCTURAL DIFFERENCE:
 *    - Memory Lane: Nested JSONB metadata (rich structure)
 *    - Plugin: Flat columns for task state (bead tracking)
 *
 * 2. ENTITY MODELING:
 *    - Memory Lane: Rich EntityReference objects with type/resolved fields
 *    - Plugin: Likely simple string references or IDs
 *
 * 3. TEMPORAL SUPPORT:
 *    - Memory Lane: valid_from/valid_until columns (added via migration)
 *    - Plugin: Created/updated timestamps only (no temporal validity)
 *
 * 4. FEEDBACK LOOP:
 *    - Memory Lane: feedback_score + feedback_count for learning
 *    - Plugin: No explicit feedback mechanism for task tracking
 *
 * 5. TAXONOMY:
 *    - Memory Lane: 10 memory types with priority weights (below)
 *    - Plugin: bead types (bug, feature, task, epic, chore)
 *    → These are DIFFERENT taxonomies for DIFFERENT purposes
 *
 * INTEGRATION NOTE:
 * ---------------
 * Memory Lane does NOT replace or modify the plugin's 'cells' table.
 * The 'cells' table continues to manage hive/bead coordination.
 * Memory Lane adds a separate 'memories' table for persistent learning.
 *
 * The two systems are complementary:
 * - 'cells' table: Short-term task coordination (ephemeral)
 * - 'memories' table: Long-term knowledge retention (persistent)
 *
 * This separation allows Memory Lane to evolve independently while
 * the plugin's core coordination logic remains unchanged.
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

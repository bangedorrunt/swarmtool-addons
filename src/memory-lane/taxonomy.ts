/**
 * Memory Lane Taxonomy
 *
 * Defines types, priorities, and metadata structures for persistent memories.
 * Aligns with opencode-swarm-plugin v0.31.0 (Drizzle 0.41.0) schema.
 *
 * DRIZZLE SCHEMA ALIGNMENT:
 * --------------------------
 * This taxonomy provides type-safe metadata structures compatible with:
 * - libSQL with F32_BLOB(1024) vectors for embeddings
 * - TEXT JSON metadata column for extended metadata
 * - Temporal validity (valid_from/valid_until) for lifecycle management
 * - Supersession chains for knowledge evolution
 * - Confidence-based decay for relevance ranking
 *
 * METADATA STRUCTURE:
 * ------------------
 * Memory Lane metadata is packed into the standard 'memories' table's 'metadata'
 * column as JSONB (see MemoryLaneMetadataSchema).
 *
 * All fields are type-aligned with Drizzle-generated schemas from opencode-swarm-plugin,
 * enabling:
 * - Type-safe database queries via Drizzle ORM
 * - Proper JSONB metadata structure validation
 * - Temporal queries (valid_from <= NOW <= valid_until)
 * - Supersession graph traversal for knowledge evolution
 * - Confidence decay calculations for relevance ranking
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
 * ISO 8601 timestamp for temporal validity tracking
 */
export type Timestamp = string; // ISO 8601 format: "2025-12-28T12:00:00Z"

/**
 * Metadata packed into the standard Memory.metadata column
 * Aligned with Drizzle schema from opencode-swarm-plugin v0.31.0
 */
export const MemoryLaneMetadataSchema = z.object({
  // Version tracking
  lane_version: z.string(),

  // Taxonomy classification
  memory_type: MemoryTypeSchema,

  // Entity associations
  entity_slugs: z.array(z.string()).default([]),
  entities: z.array(z.any()).default([]), // EntityReference[]

  // Confidence metrics
  confidence_score: z.number().min(0).max(100).default(70),
  decay_factor: z.number().min(0).max(1).default(1.0),

  // Source and provenance
  source_chunk: z.string().optional(),
  tags: z.array(z.string()).optional(),

  // Feedback loop
  feedback_score: z.number().optional().default(1.0),
  feedback_count: z.number().optional().default(0),

  // Temporal validity (aligned with Drizzle schema)
  valid_from: z.string().optional(), // ISO 8601 timestamp
  valid_until: z.string().optional(), // ISO 8601 timestamp

  // Supersession chains (knowledge evolution)
  supersedes: z.array(z.string()).optional(), // Array of memory IDs this memory replaces
  superseded_by: z.string().optional(), // Memory ID that replaces this memory

  // Observation tracking (aligned with core schema)
  times_observed: z.number().optional().default(1),
  first_observed_at: z.string().optional(), // ISO 8601 timestamp
  last_observed_at: z.string().optional(), // ISO 8601 timestamp

  // Access tracking (for decay calculations)
  access_count: z.number().optional().default(0),
  last_accessed_at: z.string().optional(), // ISO 8601 timestamp
});

export type MemoryLaneMetadata = z.infer<typeof MemoryLaneMetadataSchema>;

/**
 * Priority weights for memory types in search ranking
 * Higher weight = higher relevance in default ranking
 */
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

/**
 * Factory function to create MemoryLaneMetadata with proper defaults
 * Aligns with Drizzle schema from opencode-swarm-plugin
 *
 * @param base - Partial metadata fields
 * @returns Complete MemoryLaneMetadata with defaults
 */
export function createMemoryMetadata(
  base: Partial<MemoryLaneMetadata> & Pick<MemoryLaneMetadata, 'memory_type'>
): MemoryLaneMetadata {
  const now = new Date().toISOString();

  return {
    // Required field
    lane_version: '1.0.0',
    memory_type: base.memory_type,

    // Entities
    entity_slugs: base.entity_slugs ?? [],
    entities: base.entities ?? [],

    // Confidence metrics
    confidence_score: base.confidence_score ?? 70,
    decay_factor: base.decay_factor ?? 1.0,

    // Source and tags
    source_chunk: base.source_chunk,
    tags: base.tags,

    // Feedback
    feedback_score: base.feedback_score ?? 1.0,
    feedback_count: base.feedback_count ?? 0,

    // Temporal validity (default: valid from now, no expiration)
    valid_from: base.valid_from ?? now,
    valid_until: base.valid_until,

    // Supersession (default: no supersession)
    supersedes: base.supersedes ?? [],
    superseded_by: base.superseded_by,

    // Observation tracking (default: first observation now)
    times_observed: base.times_observed ?? 1,
    first_observed_at: base.first_observed_at ?? now,
    last_observed_at: base.last_observed_at ?? now,

    // Access tracking (default: no access)
    access_count: base.access_count ?? 0,
    last_accessed_at: base.last_accessed_at,
  };
}

/**
 * Calculate effective confidence score after applying decay factor
 * Used in search ranking to adjust relevance based on age and access patterns
 *
 * @param base_confidence - Original confidence score (0-100)
 * @param decay_factor - Decay factor (0-1, where 1.0 = no decay)
 * @returns Adjusted confidence score (0-100)
 */
export function calculateEffectiveConfidence(
  base_confidence: number,
  decay_factor: number
): number {
  return Math.round(base_confidence * decay_factor);
}

/**
 * Check if memory is currently valid based on temporal fields
 * Aligns with Drizzle schema's temporal validity queries
 *
 * @param metadata - Memory metadata to check
 * @returns True if memory is currently valid
 */
export function isMemoryValid(metadata: MemoryLaneMetadata): boolean {
  const now = new Date();

  // If valid_from is set, check if it's in the past or now
  if (metadata.valid_from) {
    const validFrom = new Date(metadata.valid_from);
    if (validFrom > now) return false;
  }

  // If valid_until is set, check if it's in the future
  if (metadata.valid_until) {
    const validUntil = new Date(metadata.valid_until);
    if (validUntil <= now) return false;
  }

  return true;
}

/**
 * Calculate decay factor based on access pattern
 * More recent access = lower decay (higher relevance)
 * Stale memories = higher decay (lower relevance)
 *
 * @param last_accessed - ISO timestamp of last access
 * @param created_at - ISO timestamp when memory was created
 * @returns Decay factor (0-1)
 */
export function calculateDecayFactor(
  last_accessed: string | undefined,
  created_at: string
): number {
  const now = new Date();
  const created = new Date(created_at);
  const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

  // Default decay: 1.0 (no decay) for recent memories (< 7 days)
  if (daysSinceCreation < 7) return 1.0;

  // Calculate decay based on last access
  if (last_accessed) {
    const lastAccess = new Date(last_accessed);
    const daysSinceAccess = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);

    // Accessed within 7 days: no decay
    if (daysSinceAccess < 7) return 1.0;

    // Accessed 7-30 days ago: light decay (0.8)
    if (daysSinceAccess < 30) return 0.8;

    // Accessed 30-90 days ago: moderate decay (0.6)
    if (daysSinceAccess < 90) return 0.6;

    // Accessed 90+ days ago: heavy decay (0.4)
    return 0.4;
  }

  // Never accessed: heavy decay based on age
  if (daysSinceCreation < 30) return 0.8;
  if (daysSinceCreation < 90) return 0.6;
  return 0.4;
}

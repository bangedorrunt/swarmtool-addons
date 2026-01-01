/**
 * Memory Lane Tools
 *
 * OpenCode plugin tools for memory storage and retrieval.
 * Uses standalone MemoryLaneStore with no swarm-mail dependencies.
 */

import { tool } from '@opencode-ai/plugin';
import { getMemoryLaneStore } from './memory-store';
import { EntityResolver } from './resolver';

/**
 * Smart search through Memory Lane
 */
export const memory_lane_find = tool({
  description:
    'Advanced semantic search through Memory Lane with intent boosting and entity awareness.',
  args: {
    query: tool.schema.string().optional().describe('Search query'),
    entities: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Entity slugs or raw names (e.g. ['project:swarm', 'Mark'])"),
    limit: tool.schema.number().optional().default(5).describe('Max results'),
  },
  async execute(args) {
    const store = getMemoryLaneStore();

    // Resolve entities before search
    const resolvedSlugs: string[] = [];
    const ambiguities: Record<string, string[]> = {};

    if (args.entities) {
      for (const entityQuery of args.entities) {
        const matches = await EntityResolver.disambiguate(entityQuery);
        if (matches.length === 1) {
          resolvedSlugs.push(matches[0]);
        } else if (matches.length > 1) {
          ambiguities[entityQuery] = matches;
        }
      }
    }

    // Handle ambiguity
    if (Object.keys(ambiguities).length > 0) {
      return JSON.stringify(
        {
          success: false,
          error: 'DISAMBIGUATION_REQUIRED',
          message: 'Multiple entity matches found. Please specify which one you meant.',
          ambiguities,
          hint: "Use full slug (e.g. 'person:mark-robinson') in entities array.",
        },
        null,
        2
      );
    }

    // Execute search
    const result = await store.smartFind({
      ...args,
      entities: resolvedSlugs,
    });

    return JSON.stringify(result, null, 2);
  },
});

/**
 * Store a categorized memory
 */
export const memory_lane_store = tool({
  description: 'Store a memory with specific taxonomy and entity associations.',
  args: {
    information: tool.schema.string().describe('The knowledge to store'),
    type: tool.schema
      .enum([
        'correction',
        'decision',
        'commitment',
        'insight',
        'learning',
        'confidence',
        'pattern_seed',
        'cross_agent',
        'workflow_note',
        'gap',
      ])
      .describe('Memory type (correction, decision, etc.)'),
    entities: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('Entity slugs associated with this memory'),
    tags: tool.schema.string().optional().describe('Comma separated tags'),
  },
  async execute(args) {
    const store = getMemoryLaneStore();
    const result = await store.store(args as any);

    return JSON.stringify(result, null, 2);
  },
});

/**
 * Record feedback on a memory for adaptive learning
 */
export const memory_lane_feedback = tool({
  description: 'Record feedback (helpful or harmful) on a memory to adjust future search rankings.',
  args: {
    id: tool.schema.string().describe('Memory ID to provide feedback on'),
    signal: tool.schema
      .enum(['helpful', 'harmful'])
      .describe('Feedback type: helpful increases relevance, harmful decreases'),
  },
  async execute(args) {
    const store = getMemoryLaneStore();
    await store.recordFeedback(args.id, args.signal);

    return JSON.stringify(
      {
        success: true,
        message: `Recorded ${args.signal} feedback for memory ${args.id}`,
        id: args.id,
        signal: args.signal,
      },
      null,
      2
    );
  },
});

/**
 * Legacy semantic-memory_find redirect
 */
export const semantic_memory_find = tool({
  description: 'Find memories by semantic similarity. (Use memory-lane_find instead)',
  args: {
    query: tool.schema.string().describe('Search query'),
    limit: tool.schema.number().optional().default(5).describe('Max results'),
  },
  async execute(args) {
    const store = getMemoryLaneStore();
    const result = await store.smartFind({
      query: args.query,
      limit: args.limit || 5,
    });

    return JSON.stringify(
      {
        ...result,
        _hint: "Use 'memory-lane_find' directly for intent boosting and entity awareness.",
      },
      null,
      2
    );
  },
});

/**
 * Legacy semantic-memory_store redirect
 */
export const semantic_memory_store = tool({
  description: 'Store a memory. (Use memory-lane_store instead)',
  args: {
    information: tool.schema.string().describe('The knowledge to store'),
  },
  async execute(args) {
    const store = getMemoryLaneStore();
    const result = await store.store({
      information: args.information,
      type: 'learning',
    });

    return JSON.stringify(
      {
        ...result,
        _hint: "Use 'memory-lane_store' directly to specify taxonomy.",
      },
      null,
      2
    );
  },
});

/**
 * Export tool collection for plugin registration
 */
export const memoryLaneTools = {
  'memory-lane_find': memory_lane_find,
  'memory-lane_store': memory_lane_store,
  'memory-lane_feedback': memory_lane_feedback,
  'semantic-memory_find': semantic_memory_find,
  'semantic-memory_store': semantic_memory_store,
} as const;

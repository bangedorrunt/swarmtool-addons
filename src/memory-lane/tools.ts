/**
 * Memory Lane Sidecar Tools
 *
 * New implementation using SHARED database instance from swarm-mail.
 * CRITICAL FIX: No separate database connections created.
 *
 * Architecture:
 * - swarm-mail creates database during MemoryStore initialization
 * - Memory Lane receives same db instance via constructor
 * - All operations use shared instance, preventing lock conflicts
 */

import { tool } from '@opencode-ai/plugin';
import { MemoryLaneAdapter } from './adapter';
import { MemoryTypeSchema } from './taxonomy';

/**
 * Retrieve shared Memory Lane adapter instance.
 *
 * The db parameter is the SAME instance used by swarm-mail's
 * MemoryAdapter, ensuring we never create a separate connection.
 *
 * This instance is set by swarm-mail during MemoryStore creation
 * and passed to MemoryLaneAdapter via initialization hooks.
 *
 * @throws Error if adapter not yet initialized (should never happen in production)
 */
function getLaneAdapter(db: any): MemoryLaneAdapter {
  // Check if adapter already has our db instance stored
  if ('getDbInstance' in db && typeof db.getDbInstance === 'function') {
    const instance = db.getDbInstance();

    // Verify this is our MemoryLaneAdapter
    if (instance instanceof MemoryLaneAdapter) {
      return instance as MemoryLaneAdapter;
    }

    throw new Error(
      'Database instance is not a MemoryLaneAdapter. ' +
        'getLaneAdapter() should only be called after swarm-mail ' +
        'initializes MemoryLaneAdapter with the db reference.'
    );
  }

  // Fallback: This should not happen in production because MemoryLaneAdapter
  // is initialized by swarm-mail before any tools are called.
  throw new Error(
    'MemoryLaneAdapter not initialized. ' +
      'Ensure swarm-mail has initialized MemoryStore before calling tools. ' +
      'If you need to access Memory Lane directly, use the db instance ' +
      "from swarm-mail's getDatabase() method."
  );
}

/**
 * Smart search through Memory Lane
 */
export const memory_lane_find = tool({
  description:
    'Advanced semantic search through Memory Lane with intent boosting and entity awareness. If entity names are ambiguous, system will ask for clarification.',
  args: {
    query: tool.schema.string().optional().describe('Search query'),
    entities: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Entity slugs or raw names (e.g. ['project:swarm', 'Mark'])"),
    limit: tool.schema.number().optional().default(5).describe('Max results'),
  },
  async execute(args, _context) {
    // Get shared database instance from input.directory (swarm-mail's context)
    const db = _context.client.swarmMail.getDatabase();

    const adapter = getLaneAdapter(db);

    // Resolve entities before search
    const resolvedSlugs: string[] = [];
    const ambiguities: Record<string, string[]> = {};

    // 1. Disambiguate Entities
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

    // 2. Handle Ambiguity
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

    // 3. Execute Search
    const result = await adapter.smartFind({
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
    type: MemoryTypeSchema.describe('Memory type (correction, decision, etc.)'),
    entities: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('Entity slugs associated with this memory'),
    tags: tool.schema.string().optional().describe('Comma separated tags'),
  },
  async execute(args, _context) {
    // Get shared database instance from input.directory
    const db = _context.client.swarmMail.getDatabase();

    const adapter = getLaneAdapter(db);
    const result = await adapter.storeLaneMemory(args);

    return JSON.stringify(result, null, 2);
  },
});

/**
 * Record feedback on a memory for adaptive learning
 */
export const memory_lane_feedback = tool({
  description:
    'Record feedback (helpful or harmful) on a memory to adjust future search rankings. Helpful feedback increases relevance (+10%), harmful decreases ranking (-50%).',
  args: {
    id: tool.schema.string().describe('Memory ID to provide feedback on'),
    signal: tool.schema
      .enum(['helpful', 'harmful'])
      .describe(
        'Feedback type: helpful (increases future relevance) or harmful (decreases future relevance)'
      ),
  },
  async execute(args, _context) {
    // Get shared database instance from input.directory
    const db = _context.client.swarmMail.getDatabase();

    const adapter = getLaneAdapter(db);
    await adapter.recordFeedback(args.id, args.signal);

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
 * Transparent redirection from legacy semantic-memory_find to memory-lane_find
 */
export const semantic_memory_find = tool({
  description:
    'Find memories by semantic similarity. (REDIRECT: Use memory-lane_find instead for better results).',
  args: {
    query: tool.schema.string().describe('Search query'),
    limit: tool.schema.number().optional().default(5).describe('Max results'),
    collection: tool.schema.string().optional().describe('Collection name'),
  },
  async execute(args, _context) {
    // Get shared database instance from input.directory
    const db = _context.client.swarmMail.getDatabase();

    const adapter = getLaneAdapter(db);
    const result = await adapter.smartFind({
      query: args.query,
      limit: args.limit || 5,
    });

    return JSON.stringify(
      {
        ...result,
        _hint:
          "SYSTEM: This call was transparently redirected to memory-lane_find. In the future, use 'memory-lane_find' directly for intent boosting and entity awareness.",
      },
      null,
      2
    );
  },
});

/**
 * Transparent redirection from legacy semantic-memory_store to memory-lane_store
 */
export const semantic_memory_store = tool({
  description: 'Store a memory. (REDIRECT: Use memory-lane_store instead for taxonomy support).',
  args: {
    information: tool.schema.string().describe('The knowledge to store'),
    metadata: tool.schema.string().optional().describe('Metadata JSON'),
  },
  async execute(args, _context) {
    // Get shared database instance from input.directory
    const db = _context.client.swarmMail.getDatabase();

    const adapter = getLaneAdapter(db);
    // Default to 'learning' type for legacy stores
    const result = await adapter.storeLaneMemory({
      information: args.information,
      type: 'learning',
    });

    return JSON.stringify(
      {
        ...result,
        _hint:
          "SYSTEM: This memory was stored using memory-lane_store with type='learning'. Use 'memory-lane_store' directly to specify better taxonomy (decision, correction, etc).",
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

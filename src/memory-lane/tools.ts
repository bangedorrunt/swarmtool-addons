/**
 * Memory Lane Sidecar Tools
 *
 * New tools for interacting with the Memory Lane system.
 */

import { tool } from '@opencode-ai/plugin';
import { MemoryLaneAdapter } from './adapter';
import { createMemoryAdapter } from 'opencode-swarm-plugin';
import { getSwarmMailLibSQL } from 'swarm-mail';
import { MemoryTypeSchema } from './taxonomy';

import { EntityResolver } from './resolver';
import { ensureSchema } from './migration';

/**
 * DATABASE PATH RESOLUTION - CRITICAL PATH MISMATCH
 *
 * PROBLEM: This function uses process.cwd() to determine the database path.
 *
 * - swarmtool-addons (this package) uses process.cwd() for database location
 * - opencode-swarm-plugin uses projectDirectory from OpenCode context (input.directory)
 *
 * ROOT CAUSE OF CONNECTION FAILURES:
 * When running from different directories (e.g., plugin vs standalone), these paths differ,
 * resulting in SEPARATE swarm.db instances being created in different locations.
 *
 * Example scenarios causing separate databases:
 * 1. Plugin initializes with input.directory = /Users/user/project/swarm-tools
 *    → Creates database at /Users/user/project/swarm-tools/.hive/swarm.db
 *
 * 2. Addon called from /Users/user/project/swarmtool-addons
 *    → Creates database at /Users/user/project/swarmtool-addons/.hive/swarm.db
 *
 * RESULT: Cannot connect to plugin's database - "Could not connect to swarm.db" error
 *
 * PROPER SOLUTION (requires coordination with plugin):
 * - Addon should receive projectDirectory from OpenCode context, not use process.cwd()
 * - Both plugin and addon should use the same path resolution mechanism
 * - Consider passing projectPath as parameter or using centralized config
 */
async function getLaneAdapter(): Promise<MemoryLaneAdapter> {
  // CRITICAL: Uses process.cwd() for database path
  // This differs from plugin which uses input.directory (OpenCode context)
  // See DATABASE PATH RESOLUTION comment above for details
  const swarmMail = await getSwarmMailLibSQL(process.cwd());
  const db = await swarmMail.getDatabase();

  // Ensure schema is up to date
  await ensureSchema(db);

  const baseMemory = await createMemoryAdapter(db);
  return new MemoryLaneAdapter(baseMemory);
}

/**
 * Smart search through Memory Lane
 */
export const memory_lane_find = tool({
  description:
    'Advanced semantic search through Memory Lane with intent boosting and entity awareness. If entity names are ambiguous, the system will ask for clarification.',
  args: {
    query: tool.schema.string().optional().describe('Search query'),
    entities: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Entity slugs or raw names (e.g. ['project:swarm', 'Mark'])"),
    limit: tool.schema.number().optional().default(5).describe('Max results'),
  },
  async execute(args) {
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
          error: 'CLARIFICATION_REQUIRED',
          message: 'Multiple entity matches found. Please specify which one you meant.',
          ambiguities,
          hint: "Use the full slug (e.g. 'person:mark-robinson') in the entities array.",
        },
        null,
        2
      );
    }

    // 3. Execute Search
    const adapter = await getLaneAdapter();
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
    type: MemoryTypeSchema.describe('Memory type (correction, decision, etc)'),
    entities: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('Entity slugs associated with this memory'),
    tags: tool.schema.string().optional().describe('Comma separated tags'),
  },
  async execute(args) {
    const adapter = await getLaneAdapter();
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
  async execute(args) {
    const adapter = await getLaneAdapter();
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
  async execute(args) {
    const adapter = await getLaneAdapter();
    const result = await adapter.smartFind({
      query: args.query,
      limit: args.limit,
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
  async execute(args) {
    const adapter = await getLaneAdapter();
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

export const memoryLaneTools = {
  'memory-lane_find': memory_lane_find,
  'memory-lane_store': memory_lane_store,
  'memory-lane_feedback': memory_lane_feedback,
  'semantic-memory_find': semantic_memory_find,
  'semantic-memory_store': semantic_memory_store,
} as const;

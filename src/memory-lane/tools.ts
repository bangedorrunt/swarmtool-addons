/**
 * Memory Lane Sidecar Tools
 * 
 * New tools for interacting with the Memory Lane system.
 */

import { tool } from "@opencode-ai/plugin";
import { MemoryLaneAdapter } from "./adapter";
import { createMemoryAdapter } from "opencode-swarm-plugin";
import { getSwarmMailLibSQL } from "swarm-mail";
import { MemoryTypeSchema } from "./taxonomy";

import { EntityResolver } from "./resolver";

async function getLaneAdapter(): Promise<MemoryLaneAdapter> {
  const swarmMail = await getSwarmMailLibSQL(process.cwd());
  const db = await swarmMail.getDatabase();
  const baseMemory = await createMemoryAdapter(db);
  return new MemoryLaneAdapter(baseMemory);
}

/**
 * Smart search through Memory Lane
 */
export const memory_lane_find = tool({
  description: "Advanced semantic search through Memory Lane with intent boosting and entity awareness. If entity names are ambiguous, the system will ask for clarification.",
  args: {
    query: tool.schema.string().describe("Search query"),
    entities: tool.schema.array(tool.schema.string()).optional().describe("Entity slugs or raw names (e.g. ['project:swarm', 'Mark'])"),
    limit: tool.schema.number().optional().default(5).describe("Max results")
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
      return JSON.stringify({
        success: false,
        error: "CLARIFICATION_REQUIRED",
        message: "Multiple entity matches found. Please specify which one you meant.",
        ambiguities,
        hint: "Use the full slug (e.g. 'person:mark-robinson') in the entities array."
      }, null, 2);
    }

    // 3. Execute Search
    const adapter = await getLaneAdapter();
    const result = await adapter.smartFind({
      ...args,
      entities: resolvedSlugs
    });
    return JSON.stringify(result, null, 2);
  }
});

/**
 * Store a categorized memory
 */
export const memory_lane_store = tool({
  description: "Store a memory with specific taxonomy and entity associations.",
  args: {
    information: tool.schema.string().describe("The knowledge to store"),
    type: MemoryTypeSchema.describe("Memory type (correction, decision, etc)"),
    entities: tool.schema.array(tool.schema.string()).optional().describe("Entity slugs associated with this memory"),
    tags: tool.schema.string().optional().describe("Comma separated tags")
  },
  async execute(args) {
    const adapter = await getLaneAdapter();
    const result = await adapter.storeLaneMemory(args);
    return JSON.stringify(result, null, 2);
  }
});

/**
 * Record feedback on a memory for adaptive learning
 */
export const memory_lane_feedback = tool({
  description: "Record feedback (helpful or harmful) on a memory to adjust future search rankings. Helpful feedback increases relevance (+10%), harmful decreases ranking (-50%).",
  args: {
    id: tool.schema.string().describe("Memory ID to provide feedback on"),
    signal: tool.schema.enum(["helpful", "harmful"]).describe("Feedback type: helpful (increases future relevance) or harmful (decreases future relevance)")
  },
  async execute(args) {
    const adapter = await getLaneAdapter();
    await adapter.recordFeedback(args.id, args.signal);
    return JSON.stringify({
      success: true,
      message: `Recorded ${args.signal} feedback for memory ${args.id}`,
      id: args.id,
      signal: args.signal
    }, null, 2);
  }
});

export const memoryLaneTools = {
  "memory-lane_find": memory_lane_find,
  "memory-lane_store": memory_lane_store,
  "memory-lane_feedback": memory_lane_feedback,
} as const;

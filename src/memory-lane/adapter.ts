/**
 * Memory Lane Sidecar Adapter
 * 
 * Implements high-integrity search, intent boosting, and entity filtering
 * on top of the base Swarm Tools MemoryAdapter.
 */

import { 
  MemoryAdapter, 
  FindResult, 
  StoreArgs, 
  StoreResult 
} from "opencode-swarm-plugin";
import { 
  MemoryType, 
  MemoryLaneMetadata, 
  MemoryLaneMetadataSchema,
  PRIORITY_WEIGHTS 
} from "./taxonomy";

export interface SmartFindArgs {
  query: string;
  limit?: number;
  entities?: string[]; // strictly filter by these entity slugs
}

export class MemoryLaneAdapter {
  private readonly COLLECTION = "memory-lane";
  private readonly LANE_VERSION = "1.0.0";
  
  constructor(private readonly baseAdapter: MemoryAdapter) {}

  /**
   * Store a memory with Memory Lane specific metadata
   */
  async storeLaneMemory(args: StoreArgs & { 
    type: MemoryType, 
    entities?: string[],
    confidence_score?: number 
  }): Promise<StoreResult> {
    
    const laneMetadata: MemoryLaneMetadata = {
      lane_version: this.LANE_VERSION,
      memory_type: args.type,
      entity_slugs: args.entities || [],
      entities: [], // Would be populated by an entity resolver
      confidence_score: args.confidence_score ?? 70,
      tags: args.tags ? args.tags.split(',').map(t => t.trim()) : [],
      feedback_score: 1.0, // Initial neutral score
      feedback_count: 0
    };

    return this.baseAdapter.store({
      ...args,
      collection: this.COLLECTION,
      metadata: JSON.stringify(laneMetadata)
    });
  }

  /**
   * Record feedback for a specific memory
   * Updates the aggregate score in metadata
   */
  async recordFeedback(id: string, signal: 'helpful' | 'harmful'): Promise<void> {
    const memory = await this.baseAdapter.get({ id });
    if (!memory) return;

    let metadata: MemoryLaneMetadata;
    try {
      metadata = MemoryLaneMetadataSchema.parse(
        typeof memory.metadata === 'string' ? JSON.parse(memory.metadata) : memory.metadata
      );
    } catch {
      return; // Malformed metadata
    }

    // Apply adjustment
    if (signal === 'helpful') {
      metadata.feedback_score = (metadata.feedback_score || 1.0) * 1.10;
    } else {
      metadata.feedback_score = (metadata.feedback_score || 1.0) * 0.50;
    }
    metadata.feedback_count = (metadata.feedback_count || 0) + 1;

    // Update memory (requires re-storing or a specialized update method)
    // Since MemoryStore typically uses store() for upserts by ID:
    await this.baseAdapter.store({
      information: memory.content,
      collection: this.COLLECTION,
      metadata: JSON.stringify(metadata),
      confidence: memory.confidence
    });
  }

  /**
   * Smart Retrieval Engine
   * 1. Detect intent boosting
   * 2. Apply entity filtering
   * 3. Re-rank results (Priority + Intent + Feedback)
   */
  async smartFind(args: SmartFindArgs): Promise<FindResult> {
    const { query, limit = 10 } = args;
    
    // 1. Detect Intent Boosting
    const boostedTypes = this.detectIntent(query);

    // 2. Base Retrieval (Vector Search)
    const baseResult = await this.baseAdapter.find({
      query,
      limit: limit * 3, 
      collection: this.COLLECTION,
      expand: true
    });

    // 3. Re-Ranking & Filtering
    const isEntityFiltered = args.entities && args.entities.length > 0;
    const minScoreThreshold = isEntityFiltered ? 0.40 : 0.50;

    const scoredResults = baseResult.results.map(res => {
      // Validate metadata schema
      let metadata: MemoryLaneMetadata;
      try {
        metadata = MemoryLaneMetadataSchema.parse(
          typeof res.metadata === 'string' ? JSON.parse(res.metadata) : res.metadata
        );
      } catch (e) {
        return { ...res, score: res.score * 0.1 };
      }

      let finalScore = res.score;

      // Apply Taxonomy Priority Weight
      const typeWeight = PRIORITY_WEIGHTS[metadata.memory_type] || 0.5;
      finalScore *= typeWeight;

      // Apply Intent Boost (+15%)
      if (boostedTypes.includes(metadata.memory_type)) {
        finalScore *= 1.15;
      }

      // Apply Feedback Adjustment
      finalScore *= (metadata.feedback_score || 1.0);

      // Apply Entity Filter (Strict)
      if (isEntityFiltered) {
        const hasMatch = args.entities!.some(slug => 
          metadata.entity_slugs?.includes(slug)
        );
        if (!hasMatch) finalScore = 0;
      }

      return { ...res, score: finalScore, metadata };
    });

    // Sort by new score and truncate
    const finalResults = scoredResults
      .filter(r => r.score >= minScoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      results: finalResults,
      count: finalResults.length
    };
  }

  /**
   * Scan query for intent keywords to boost specific memory types
   */
  private detectIntent(query: string): MemoryType[] {
    const q = query.toLowerCase();
    const boosts: MemoryType[] = [];

    if (q.includes("mistake") || q.includes("wrong") || q.includes("error")) {
      boosts.push("correction", "gap");
    }
    if (q.includes("decided") || q.includes("chose") || q.includes("choice")) {
      boosts.push("decision");
    }
    if (q.includes("pattern") || q.includes("usually") || q.includes("habit")) {
      boosts.push("pattern_seed", "commitment");
    }
    if (q.includes("learned") || q.includes("realized")) {
      boosts.push("learning", "insight");
    }

    return boosts;
  }
}
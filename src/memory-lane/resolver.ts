/**
 * Memory Lane Entity Resolver
 *
 * Provides utilities for extracting entity slugs from text and file paths.
 * Migrated to use Drizzle ORM for database-backed entity disambiguation.
 */

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface ResolvedEntity {
  type: string;
  slug: string;
}

// Re-export SwarmDb type for compatibility
export type SwarmDb = LibSQLDatabase<any>;

export class EntityResolver {
  private readonly db: SwarmDb;
  private readonly client: Client;

  constructor() {
    // Get database path with centralized preference (same as adapter.ts)
    const dbPath = this.getDatabasePath();

    // Create libSQL client
    this.client = createClient({ url: dbPath });

    // Create Drizzle ORM instance
    this.db = drizzle(this.client);
  }

  /**
   * Resolve database path with centralized preference
   * - swarm.db: Primary knowledge base (memories, entities)
   * - .opencode/swarm.db: Project-local fallback
   */
  private getDatabasePath(): string {
    const centralized = join(homedir(), '.config', 'swarm-tools', 'swarm.db');
    if (existsSync(centralized)) {
      return `file:${centralized}`;
    }

    const projectLocal = join(process.cwd(), '.opencode', 'swarm.db');
    return `file:${projectLocal}`;
  }

  /**
   * Mock registry of known entities for backward compatibility and testing
   * Used as fallback when database is empty or unavailable
   */
  private static readonly FALLBACK_ENTITIES: ResolvedEntity[] = [
    { type: 'person', slug: 'mark-robinson' },
    { type: 'person', slug: 'mark-zuckerberg' },
    { type: 'project', slug: 'swarm-tools' },
    { type: 'project', slug: 'swarm-ui' },
    { type: 'business', slug: 'indy-hall' },
  ];

  /**
   * Load unique entities from database
   * Queries all memories and extracts entity_slugs from metadata
   *
   * @returns Array of unique entity slugs
   */
  private async loadEntitiesFromDatabase(): Promise<ResolvedEntity[]> {
    try {
      // Query all memories to extract entity slugs from metadata
      const result = await this.client.execute(
        'SELECT metadata FROM memories WHERE collection = ?',
        ['memory-lane']
      );

      const entities = new Set<string>();

      for (const row of result.rows as any[]) {
        try {
          const metadata =
            typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

          if (metadata.entity_slugs && Array.isArray(metadata.entity_slugs)) {
            for (const slug of metadata.entity_slugs) {
              if (typeof slug === 'string' && slug.includes(':')) {
                entities.add(slug);
              }
            }
          }
        } catch {
          // Skip malformed metadata
          continue;
        }
      }

      // Convert slugs to ResolvedEntity format
      return Array.from(entities).map((slug) => {
        const [type, name] = slug.split(':');
        return { type, slug: name || '' };
      });
    } catch (error) {
      // Log error but return fallback entities (graceful degradation)
      console.warn(
        '[EntityResolver] Failed to load entities from database, using fallback:',
        error
      );
      return EntityResolver.FALLBACK_ENTITIES;
    }
  }

  /**
   * Extract entities from raw text using regex patterns
   * Matches patterns like:
   * - project:swarm-tools
   * - agent:BlueLake
   * - feature:auth-flow
   * - person:alex
   */
  static extractFromText(text: string): ResolvedEntity[] {
    const pattern = /\b(project|agent|feature|person|business|chore):([a-z0-9-]+)\b/gi;
    const matches: ResolvedEntity[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        type: match[1].toLowerCase(),
        slug: match[2].toLowerCase(),
      });
    }

    return matches;
  }

  /**
   * Extract entities from file paths
   *
   * Useful for Hook2 (PostToolUse) and memory-catcher to automatically
   * detect what feature or project the agent is working on.
   */
  static extractFromPath(path: string): ResolvedEntity[] {
    const entities: ResolvedEntity[] = [];
    const normalizedPath = path.toLowerCase();

    // 1. Detect Features from directory structure
    // Patterns like: src/features/auth -> feature:auth
    const featureMatch = normalizedPath.match(/features?\/([a-z0-9-]+)/);
    if (featureMatch) {
      entities.push({ type: 'feature', slug: featureMatch[1] });
    }

    // 2. Detect Components
    // Patterns like: src/components/Button -> feature:button-component
    const componentMatch = normalizedPath.match(/components?\/([a-z0-9-]+)/);
    if (componentMatch) {
      entities.push({ type: 'feature', slug: `${componentMatch[1]}-component` });
    }

    // 3. Detect Projects from monorepo structures
    // Patterns like: packages/swarm-mail -> project:swarm-mail
    const projectMatch = normalizedPath.match(/(?:packages|apps|services)\/([a-z0-9-]+)/);
    if (projectMatch) {
      entities.push({ type: 'project', slug: projectMatch[1] });
    }

    // 4. Detect Documentation and Analysis
    // Patterns like: docs/architecture -> feature:architecture-docs
    // Patterns like: .hive/analysis/agent-perf -> feature:agent-perf-analysis
    const docsMatch = normalizedPath.match(/docs\/([a-z0-9-]+)/);
    if (docsMatch) {
      entities.push({ type: 'feature', slug: `${docsMatch[1]}-docs` });
    }

    const analysisMatch = normalizedPath.match(/\.hive\/analysis\/([a-z0-9-]+)/);
    if (analysisMatch) {
      entities.push({ type: 'feature', slug: `${analysisMatch[1]}-analysis` });
    }

    // 5. Detect Skill/Tool names
    // Patterns like: skill/memory-catcher -> agent:memory-catcher
    const skillMatch = normalizedPath.match(/(?:skill|tools?)\/([a-z0-9-]+)/);
    if (skillMatch) {
      entities.push({ type: 'agent', slug: skillMatch[1] });
    }

    return entities;
  }

  /**
   * Convert resolved entities to uniform slugs
   */
  static toSlugs(entities: ResolvedEntity[]): string[] {
    return entities.map((e) => `${e.type}:${e.slug}`);
  }

  /**
   * Disambiguate fuzzy entity names
   * Returns a list of potential slug matches.
   *
   * Migrated to use database queries instead of static KNOWN_ENTITIES mock.
   *
   * @param query - Fuzzy entity name or full slug
   * @returns Array of matching entity slugs
   */
  async disambiguate(query: string): Promise<string[]> {
    const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Check for exact slug match (fast path)
    if (query.includes(':')) {
      return [query.toLowerCase()];
    }

    // 2. Load entities from database
    const knownEntities = await this.loadEntitiesFromDatabase();

    // 3. Fuzzy match against known entities
    const matches = knownEntities.filter((entity) => {
      const namePart = entity.slug.split('-').join('');
      return namePart.includes(q) || q.includes(namePart);
    });

    return EntityResolver.toSlugs(matches);
  }

  /**
   * Static helper for backward compatibility
   * Creates an instance and calls disambiguate
   *
   * @deprecated Use instance-based disambiguate for better performance
   */
  static async disambiguate(query: string): Promise<string[]> {
    const resolver = new EntityResolver();
    return resolver.disambiguate(query);
  }

  /**
   * Close the database connection
   * Call when done using the resolver
   */
  async close(): Promise<void> {
    this.client.close();
  }
}

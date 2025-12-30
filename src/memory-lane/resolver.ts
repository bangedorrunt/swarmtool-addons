/**
 * Memory Lane Entity Resolver
 *
 * Provides utilities for extracting entity slugs from text and file paths.
 * Uses Drizzle ORM with centralized database path.
 */

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getDatabasePath } from '../utils/database-path';

export interface ResolvedEntity {
  type: string;
  slug: string;
}

export type MemoryDb = LibSQLDatabase<Record<string, never>>;

export class EntityResolver {
  private readonly db: MemoryDb;
  private readonly client: Client;

  constructor() {
    // Use centralized database path
    const dbPath = getDatabasePath();
    this.client = createClient({ url: dbPath });
    this.db = drizzle(this.client);
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

      // If no entities found, use fallback
      if (entities.size === 0) {
        return EntityResolver.FALLBACK_ENTITIES;
      }

      // Convert slugs to ResolvedEntity format
      return Array.from(entities).map((slug) => {
        const [type, name] = slug.split(':');
        return { type, slug: name || '' };
      });
    } catch (error) {
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
    // Normalize query: lowercase, keep hyphens and colons
    const q = query.toLowerCase();

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
   *
   * @param query - Fuzzy entity name or full slug
   * @returns Array of matching entity slugs
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

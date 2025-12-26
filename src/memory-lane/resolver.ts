/**
 * Memory Lane Entity Resolver
 *
 * Provides utilities for extracting entity slugs from text and file paths.
 */

export interface ResolvedEntity {
  type: string;
  slug: string;
}

export class EntityResolver {
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
   * Mock registry of known entities for disambiguation testing.
   * In production, this would be queried from a database.
   */
  private static readonly KNOWN_ENTITIES: ResolvedEntity[] = [
    { type: 'person', slug: 'mark-robinson' },
    { type: 'person', slug: 'mark-zuckerberg' },
    { type: 'project', slug: 'swarm-tools' },
    { type: 'project', slug: 'swarm-ui' },
    { type: 'business', slug: 'indy-hall' },
  ];

  /**
   * Disambiguate fuzzy entity names
   * Returns a list of potential slug matches.
   */
  static async disambiguate(query: string): Promise<string[]> {
    const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Check for exact slug match
    if (query.includes(':')) return [query.toLowerCase()];

    // 2. Fuzzy match against known entities
    const matches = this.KNOWN_ENTITIES.filter((entity) => {
      const namePart = entity.slug.split('-').join('');
      return namePart.includes(q) || q.includes(namePart);
    });

    return this.toSlugs(matches);
  }
}

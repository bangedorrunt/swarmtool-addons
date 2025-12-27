/**
 * Self-healing migration for swarm-mail database
 *
 * SCHEMA COMPARISON ANALYSIS (swarmtool-addons-gfoxls-mjnz24b261l)
 * ===================================================================
 *
 * This migration adds Memory Lane-specific columns to the 'memories' table.
 * Reference: Finding mem-937fb58c9f3d5dfa - schema incompatibility identified
 * between opencode-swarm-plugin and swarmtool-addons Memory Lane.
 *
 * SCHEMA DIFFERENCES:
 * ------------------
 *
 * 1. TABLE PURPOSE MISMATCH:
 *    - opencode-swarm-plugin 'cells' table: Hive/bead tracking for swarm coordination
 *    - Memory Lane 'memories' table: Persistent memory storage with taxonomy metadata
 *    → These serve DIFFERENT purposes, not a direct schema migration
 *
 * 2. MISSING COLUMNS IN PLUGIN:
 *    Memory Lane requires these columns (not present in plugin's cells table):
 *
 *    | Column       | Type   | Purpose                              | Missing In |
 *    |-------------|--------|--------------------------------------|-----------|
 *    | valid_from  | TEXT   | Temporal validity start (temporal memory)| Plugin     |
 *    | valid_until | TEXT   | Temporal validity end (memory expiration)| Plugin     |
 *    | superseded_by| TEXT   | Memory replacement tracking            | Plugin     |
 *    | auto_tags   | TEXT   | Auto-generated classification tags      | Plugin     |
 *    | keywords    | TEXT   | Search keywords for retrieval         | Plugin     |
 *
 * 3. DATA TYPE MISMATCHES:
 *    - Plugin cells table uses different column types (not TEXT-based)
 *    - Memory Lane metadata stored as JSONB in 'metadata' column
 *    - Vector storage: Plugin uses embedding blob, Memory Lane uses F32_BLOB (1536-dim)
 *
 * 4. INTEGRATION BLOCKER:
 *    - Plugin uses swarm-mail's MemoryStore (not direct table access)
 *    - ensureSchema() only handles memories table, NOT cells or other plugin tables
 *    - Memory Lane is a separate system that requires its own table structure
 *
 * 5. SHARED STORAGE:
 *    - Both use libSQL but with DIFFERENT database paths:
 *      * Plugin: project-specific path from OpenCode context
 *      * Addon: process.cwd() → .hive/beads.db
 *    - No shared database instance between plugin and addon
 *
 * MIGRATION STRATEGY:
 * ------------------
 * This migration adds the missing columns to the 'memories' table for Memory Lane.
 * The 'cells' table (for hive/bead tracking) is NOT modified - they are separate concerns.
 *
 * Migration flow:
 * 1. Check if 'memories' table exists (created by swarm-mail)
 * 2. Identify missing columns from Memory Lane requirements
 * 3. Add each missing column as TEXT type (LibSQL-compatible)
 * 4. Gracefully handle migration failures (log warning, don't crash)
 *
 * NOTE: This does NOT resolve the 'cells' vs 'memories' table split - that's
 * a design decision. Memory Lane needs its own table structure independent of hive tracking.
 */

/**
 * Ensures the memories table has all required columns.
 * Upstream swarm-mail (v1.5.4) uses CREATE TABLE IF NOT EXISTS but doesn't handle migrations.
 */
export async function ensureSchema(db: any): Promise<void> {
  try {
    const client = db.getClient?.() || db;
    if (client && typeof client.execute === 'function') {
      // Check for columns in memories table
      const tableInfo = await client.execute('PRAGMA table_info(memories)');

      // Handle different row formats (LibSQL vs others)
      const rows = tableInfo.rows || tableInfo;
      const columns = rows.map((r: any) => r.name);

      if (columns.length === 0) {
        // Table doesn't exist yet, swarm-mail will create it
        return;
      }

      const missingColumns = [
        { name: 'valid_from', type: 'TEXT' },
        { name: 'valid_until', type: 'TEXT' },
        { name: 'superseded_by', type: 'TEXT' },
        { name: 'auto_tags', type: 'TEXT' },
        { name: 'keywords', type: 'TEXT' },
      ];

      for (const col of missingColumns) {
        if (!columns.includes(col.name)) {
          // eslint-disable-next-line no-console
          console.log(`[memory-lane] Migrating: Adding column ${col.name} to memories table`);
          await client.execute(`ALTER TABLE memories ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }
  } catch (migrationError) {
    // eslint-disable-next-line no-console
    console.warn('[memory-lane] Migration check failed:', migrationError);
  }
}

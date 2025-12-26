/**
 * Self-healing migration for swarm-mail database
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
      const tableInfo = await client.execute("PRAGMA table_info(memories)");
      
      // Handle different row formats (LibSQL vs others)
      const rows = tableInfo.rows || tableInfo;
      const columns = rows.map((r: any) => r.name);
      
      if (columns.length === 0) {
        // Table doesn't exist yet, swarm-mail will create it
        return;
      }

      const missingColumns = [
        { name: "valid_from", type: "TEXT" },
        { name: "valid_until", type: "TEXT" },
        { name: "superseded_by", type: "TEXT" },
        { name: "auto_tags", type: "TEXT" },
        { name: "keywords", type: "TEXT" }
      ];

      for (const col of missingColumns) {
        if (!columns.includes(col.name)) {
          console.log(`[memory-lane] Migrating: Adding column ${col.name} to memories table`);
          await client.execute(`ALTER TABLE memories ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }
  } catch (migrationError) {
    console.warn("[memory-lane] Migration check failed:", migrationError);
  }
}

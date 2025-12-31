import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function runGarbageCollection(
  snapshotDir: string = '.opencode/snapshots',
  maxAgeHours: number = 48
): Promise<void> {
  try {
    const files = await readdir(snapshotDir);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(snapshotDir, file);
      const stats = await stat(filePath);

      if (now - stats.mtimeMs > maxAgeMs) {
        await unlink(filePath);
        console.log(`[GC] Deleted old snapshot: ${file}`);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[GC] Error running garbage collection:', error);
    }
  }
}

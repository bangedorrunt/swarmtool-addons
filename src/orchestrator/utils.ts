/**
 * Orchestrator Utilities - Dependency Analysis and Conflict Detection
 */

/**
 * Detect Circular Dependencies in a task list
 *
 * Uses DFS to find cycles in the dependency graph.
 */
export function hasCircularDependencies(tasks: { id: string; dependencies: string[] }[]): boolean {
  const adj = new Map<string, string[]>();
  for (const task of tasks) {
    adj.set(task.id, task.dependencies);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function isCyclic(id: string): boolean {
    if (recStack.has(id)) return true;
    if (visited.has(id)) return false;

    visited.add(id);
    recStack.add(id);

    const deps = adj.get(id) || [];
    for (const depId of deps) {
      if (isCyclic(depId)) return true;
    }

    recStack.delete(id);
    return false;
  }

  for (const task of tasks) {
    if (isCyclic(task.id)) return true;
  }

  return false;
}

/**
 * Detect File Collisions between tasks
 *
 * Checks if multiple tasks intend to modify the same files.
 */
export function detectFileCollisions(tasks: { id: string; affectsFiles?: string[] }[]): {
  hasCollision: boolean;
  collisions: Array<{ file: string; taskIds: string[] }>;
} {
  const fileToTasks = new Map<string, string[]>();
  const collisions: Array<{ file: string; taskIds: string[] }> = [];

  for (const task of tasks) {
    if (!task.affectsFiles) continue;

    for (const file of task.affectsFiles) {
      if (!fileToTasks.has(file)) {
        fileToTasks.set(file, []);
      }
      const taskIds = fileToTasks.get(file)!;
      taskIds.push(task.id);
    }
  }

  for (const [file, taskIds] of fileToTasks.entries()) {
    if (taskIds.length > 1) {
      collisions.push({ file, taskIds });
    }
  }

  return {
    hasCollision: collisions.length > 0,
    collisions,
  };
}

---
"swarm-tool-addons": minor
---

Migrate Memory Lane to addon plugin and implement self-healing database migration.

- Fixed imports to use 'opencode-swarm-plugin' instead of local paths.
- Implemented transparent tool redirection from semantic-memory_* to memory-lane_*.
- Added proactive guidance for agents after session initialization.
- Implemented self-healing database migration to automatically add missing columns (valid_from, etc.) to the memories table.
- Suggestion: Plan a refactor to a dedicated 'memory_lane' table using Drizzle ORM for better isolation and type safety, matching upstream patterns.

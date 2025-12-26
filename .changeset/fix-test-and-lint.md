---
"swarm-tool-addons": patch
---

Fix failing tests and resolve project-wide ESLint issues.

- Fixed `triggerMemoryExtraction` tests by implementing a robust `Bun.$` shell mock with support for tagged template literals and method chaining.
- Resolved `ENOENT` error in `src/index.ts` by adding existence checks for `src/command` and `src/agent` directories.
- Fixed widespread ESLint errors including `no-undef` (globalThis/Response), `no-unused-vars`, and formatting issues.
- Updated `src/index.ts` to safely handle missing optional directories.

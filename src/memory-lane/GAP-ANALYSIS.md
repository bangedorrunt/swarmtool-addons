# Gap Analysis: Memory Lane Implementation vs. Design

## Executive Summary

The current implementation of Memory Lane in `src/memory-lane/` represents a **functional prototype** that successfully establishes the core "Swarm-Lane" architecture. The event-driven extraction loop, taxonomy-based storage, and intent-boosted retrieval are all implemented.

However, significant gaps exist between the **ideal state** (described in `MEMORY-LANE-SYSTEM.md`) and the **current code**, particularly regarding Entity Resolution, CASS integration, and the underlying Vector infrastructure.

## Detailed Analysis

| Feature | Design Specification | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Architecture** | Event-driven loop via `swarm-mail` outcomes. | **Implemented.** `createSwarmCompletionHook` polls `swarm-mail` and triggers extraction. | ✅ **Good** |
| **Taxonomy** | 10 memory types with priority weights. | **Implemented.** `MemoryTypeSchema` and `PRIORITY_WEIGHTS` in `taxonomy.ts`. | ✅ **Good** |
| **Retrieval** | Hybrid (Entity + Semantic) with Intent Boosting. | **Implemented.** `MemoryLaneAdapter.smartFind` includes intent detection and re-ranking logic. | ✅ **Good** |
| **Entity Resolution** | Dynamic resolution against a database of known entities. | **Partial / Mock.** `EntityResolver` uses Regex and a hardcoded `KNOWN_ENTITIES` array. No real DB connection. | ⚠️ **Gap** |
| **"Surprise" Filter** | Heuristic to detect unexpected events/corrections. | **Implicit.** Relies on a generic LLM prompt ("Extract valuable learnings"). No explicit "Surprise Metric". | ⚠️ **Gap** |
| **CASS** | Cross-Agent Session Search for pattern matching. | **Missing.** No explicit CASS logic found. Uses standard `swarm-mail` inbox for communication, but no cross-session search capability. | ❌ **Missing** |
| **Vector Storage** | PostgreSQL + pgvector. | **Ambiguous.** Uses `swarm-mail` (LibSQL/SQLite) and `opencode-swarm-plugin`. Unlikely to be true PGVector. | ⚠️ **Gap** |
| **Injection** | Dual-Hook (User Prompt + Tool Use). | **Partial.** Tool Use hook (`tool.execute.after`) is present. User Prompt hook is not explicitly visible in `src/index.ts`. | ⚠️ **Gap** |

## Critical Gaps to Address

### 1. The "Mock" Entity Resolver
*   **Issue:** `src/memory-lane/resolver.ts` relies on a static list (`KNOWN_ENTITIES`).
*   **Impact:** The system cannot learn new entities (e.g., new team members, new projects) without code changes.
*   **Recommendation:** Implement a `EntityStore` (sqlite table) that the `memory-catcher` can *write to* when it discovers new entities.

### 2. Missing CASS (Cross-Agent Session Search)
*   **Issue:** The system can recall *memories*, but it cannot search *past session logs* (CASS) as promised in the docs.
*   **Impact:** The "Swarm" side of the hybrid model (Process Optimization) is weak.
*   **Recommendation:** Implement a `cass_search` tool that queries the `swarm-mail` `messages` table using vector similarity on the `summary` column.

### 3. Implicit "Surprise" Logic
*   **Issue:** The "Surprise" filter is just a text prompt.
*   **Impact:** The memory catcher might be too "chatty" or miss subtle corrections.
*   **Recommendation:** Refine the `instruction` in `hooks.ts` to explicitly ask the LLM to output a `surprise_score` (0-10) and only store memories > 7.

## Conclusion

The current implementation is a solid foundation. It proves the **"Sidecar Pattern"** works (intercepting tools, wrapping adapters). To reach "Production Grade" (as described in the docs), we need to replace the mock components with persistent storage (Entity DB) and implement the missing search capabilities (CASS).

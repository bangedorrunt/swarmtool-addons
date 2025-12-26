# Memory Lane vs. Swarm Tools: Learning Systems Analysis

*An architectural comparison of two distinct approaches to AI memory and learning.*

## Executive Summary

While both **Memory Lane** and **Swarm Tools** aim to solve the "amnesia problem" in AI agents, they approach it from fundamentally different angles. 

*   **Memory Lane** is a **User-Centric** system designed to build a long-term *relationship* between the user and the agent. It focuses on preferences, corrections, and personalized context.
*   **Swarm Tools** is a **Task-Centric** system designed to optimize *operational efficiency*. It focuses on successful task decompositions, reusable patterns, and cross-agent coordination.

The most powerful implementation is likely a hybrid one, where Memory Lane handles the "Who" and "Why" (User Context), while Swarm Tools handles the "How" (Execution Patterns).

---

## 1. Core Philosophy & Objective

| Feature | Memory Lane | Swarm Tools |
| :--- | :--- | :--- |
| **Primary Goal** | **Context Continuity:** Make the agent feel like it "knows" you. | **Process Optimization:** Make the agent smarter at solving tasks. |
| **Key Metric** | **"Surprise":** Did the user correct me? Did something unexpected happen? | **"Outcome":** Did the task succeed or fail? Was the plan valid? |
| **Scope** | **Personal:** User preferences, specific project facts, decisions. | **Structural:** Task breakdowns, agent routing strategies, successful workflows. |
| **Durability** | **Long-term:** Preferences often valid for months/years. | **Medium-term:** Patterns decay (90 days) as tools/codebases change. |

## 2. Extraction Architecture

### Memory Lane: The "Surprise" Filter
Memory Lane uses a dedicated **Memory Catcher Agent** that runs *after* a session. It scans the transcript specifically looking for:
*   **Corrections:** "No, don't use that library."
*   **Decisions:** "We decided to use Postgres."
*   **Insights:** "We learned that the API is rate-limited."

It uses a **human-like heuristic**: "If it was surprising or important enough to correct, it's worth remembering."

### Swarm Tools: The "Success" Filter
Swarm Tools uses an **Outcome-Based** extraction mechanism. It focuses on:
*   **Pattern Extraction:** capturing the *structure* of a successful task (e.g., "How did we successfully refactor a React component?").
*   **Decomposition Strategy:** Recording how a complex prompt was broken down into sub-tasks.
*   **Outcome Recording:** `swarm_record_outcome` signals whether a specific approach worked.

It uses a **systematic heuristic**: "If this workflow resulted in a success, save the blueprint for next time."

## 3. Storage & Retrieval

| Component | Memory Lane | Swarm Tools |
| :--- | :--- | :--- |
| **Storage** | **PostgreSQL + pgvector:** Structured JSON + Embeddings. | **Semantic Memory + CASS:** Cross-Agent Session Search. |
| **Retrieval Trigger** | **Dual-Hook:** <br>1. User Prompt (Entity match).<br>2. Tool Use (File context). | **Task Initiation:** <br>1. Planning/Decomposition phase.<br>2. Agent Handoff. |
| **Search Logic** | **Hybrid:** Entity Filter ("Indy Hall") + Semantic Rank ("Events"). | **Pattern Match:** "Find past decompositions for [similar task]." |
| **Injection** | **Context Window:** Injected as "User Context" or "Memories". | **Prompt Engineering:** Injected as "Few-Shot Examples" or "Strategy Guides". |

## 4. Unifying the Systems

The `MEMORY-LANE-SYSTEM.md` document explicitly mentions an **Opencode Integration** that bridges these two worlds. This represents the ideal "End Game" architecture:

### The "Swarm-Lane" Hybrid Flow

1.  **User Prompt:** "Fix the bug in the login service."
2.  **Memory Lane (The 'Who'):**
    *   *Retrieves:* "User prefers we use `zod` for validation." (Preference)
    *   *Retrieves:* "We decided last week to deprecate the `auth-v1` package." (Decision)
3.  **Swarm Tools (The 'How'):**
    *   *Retrieves:* A successful pattern for "Debugging Node.js Services".
    *   *Retrieves:* A decomposing strategy: "Check logs -> Repro test -> Fix -> Verify."
4.  **Execution:**
    *   The agent follows the **Swarm** process (The 'How').
    *   The agent respects the **Memory Lane** constraints (The 'Who').

### Integration Points
*   **Outcome Tracking:** Memory Lane can use Swarm's `swarm_record_outcome` to graduate memories from "Candidate" to "Proven".
*   **CASS as Context:** Memory Lane's retrieval can be augmented by calling Swarm's `cass_search` to find relevant logs or technical details that aren't "personal" memories but are "project" memories.

## 5. Conclusion

**Memory Lane** is the **Agent's Heart**. It gives it personality, consistency, and alignment with the user's specific desires. It prevents the frustration of "I told you this yesterday."

**Swarm Tools** is the **Agent's Brain**. It gives it skill, reliability, and the ability to learn from past technical victories. It prevents the inefficiency of "reinventing the wheel."

**Recommendation:**
Use **Memory Lane** to manage the *relationship* and *domain constraints*. Use **Swarm Tools** to manage the *execution* and *technical capability*.

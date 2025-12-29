# Swarm Orchestration - Comprehensive Architecture & Reflections

This document provides a deep dive into the orchestration patterns, architectural decisions, and design philosophies implemented in the OpenCode Swarm.

---

## 1. System Architecture

The architecture is built on a **Hook-Driven Distributed State** model. It moves away from monolithic agent logic into a decoupled, event-based system where the OpenCode Session is the "Bus."

### **Core Components**
1.  **The Registry (Skill Loader)**: Discovers specialized agent capabilities using hierarchical slash-naming (`chief-of-staff/oracle`).
2.  **The Actors (Specialized Agents)**: Independent processing units that operate on a specific context.
3.  **The Switchboard (Lifecycle Hook)**: A centralized `tool.execute.after` hook in `index.ts` that intercepts agent intents and manages turn transitions.
4.  **The Orchestrator (Tool Suite)**: Provides the `skill_agent` and `agent_spawn` primitives used by agents to coordinate.

---

## 2. Orchestration Workflows

We use two primary interaction patterns to manage 3-way communication (User $\leftrightarrow$ Coordinator $\leftrightarrow$ Specialist).

### **Pattern A: Sequential (Durable Stream)**
Used for background task delegation where the result is critical for the next logical step.

```ascii
[ User ]       [ Coordinator ]       [ Hook ]       [ Specialist ]
   |              |                   |                |
   |--"Do Task"-->|                   |                |
   |              |--[skill_agent]--> |                |
   |              |  (async: false)   |                |
   |              |                   |                |
   |              |<<<< [ BLOCK & POLL STATUS ] >>>>>> |
   |              |                   |                |
   |              |                   |--[Prompt]----->|
   |              |                   |                |--[Execute]-->
   |              |                   |                |--[Result]--|
   |              |                   |                |<-----------|
   |              |<---[Return Text]--|                |
   |              |                   |                |
   |<-[Final Msg]-|                   |                |
```

### **Pattern B: Parallel (Interactive Handoff)**
Used for dialogue-heavy tasks where the user needs to participate in the specialist's reasoning.

```ascii
[ User ]       [ Coordinator ]       [ Hook ]       [ Specialist ]
   |              |                   |                |
   |--"Clarify X"->|                  |                |
   |              |--[skill_agent]--> |                |
   |              |  (async: true)    |                |
   |              |                   |                |
   |              |--[HANDOFF_INTENT]-|                |
   |              | (Turn Ends)       |                |
   |              |                   |--[PromptAsync]->
   |              |                   |                |
   |              |<<<<<< [ DIRECT INTERACTION ] >>>>> |
   | <-------------------------------------------------|-- "What is X?"
```

---

## 3. Real-World Scenario: Complex Feature Implementation

### **The Setup**
*   **User**: "Add a memory extraction feature to my plugin."
*   **Coordinator (Planner)**: Uses the `chief-of-staff` skill.
*   **Specialist 1 (Architect)**: Evaluates the project structure.
*   **Specialist 2 (Coder)**: Writes the TypeScript code.

### **The Execution Flow**
1.  **Durable Stream Initiation**: The **Planner** calls the **Architect** with `async: false`.
    - The **Architect** analyzes the files and returns a JSON structure of changes.
    - The **Planner** receives this text directly in its tool output.
2.  **Sequential Processing**: The **Planner** reviews the Architect's plan. It decides everything looks good.
3.  **Task Delegation**: The **Planner** calls the **Coder** with `async: false`.
    - The **Coder** implements the solution.
    - The **Planner** waits until the Coder is `idle`.
4.  **Interactive Handoff**: Once the code is ready, the **Planner** calls the **User** via a `HANDOFF_INTENT` to the **Interviewer** agent.
    - **Interviewer**: "I've implemented the feature. Would you like me to run the tests now?"
5.  **Continuity Learning**: Upon completion, the `swarm_complete` hook triggers, harvesting the "Memory Extraction" pattern for future project spawns.

---

## 4. Key Design Patterns

### **The Actor Model (Isolation)**
Every agent is a stateless Actor. Communication is handled by "paging" context in and out of Sessions. Standardizing on **isolated sub-sessions** for sync calls prevents the parent's context from becoming an unreadable "wall of logs."

### **The Centralized Switchboard**
By moving `promptAsync` into the global hook:
*   We eliminate deadlocks (racing against the current turn's settlement).
*   We provide a single point of observability for the entire swarm.

### **Continuity Learning**
The connection between **Durable Streams** and **Memory Lane**. Every finished stream leaves behind a distilled "Outcome," which is injected into the next Actor's context via the `sessionLearningHook`.

---

## 5. Reflections on SDK Paradigms

1.  **Sessions are Logs**: Don't treat a session like a socket; treat it like a collaboratively edited file.
2.  **Idle is the Only Signal**: In a world of multi-turn reasoning, you can never assume an agent is "done" until the SDK reports the session status as `idle`.
3.  **Metadata is the Control Plane**: Use the message body for content and the metadata object for orchestration signals. This keeps the UX clean while the underlying logic remains complex.

---
*Last Updated: 2025-12-30*
*Architecture Version: 2.1.0 (Sequential Orchestration Enabled)*

# RESEARCH: CONTINUOUS-CLAUDE-V2 ANALYSIS
## Overview
This document analyzes the architecture and design patterns of `Continuous-Claude-v2`, which serves as a primary inspiration for our swarm-tool coordination and state management system.

## CORE CONCEPTS
### 1. Externalized Session State (The Ledger Pattern)
• SOURCE OF TRUTH: State is maintained in external Markdown files (`thoughts/ledgers/`) rather than relying on LLM context.
• PERSISTENCE: Ledgers survive `/clear` commands and session restarts.
• COMPRESSION: Instead of summarizing old conversations (lossy), the system maintains a structured "Now" state (lossless).

### 2. Lifecycle Hooks
• AUTOMATION: State loading/saving is tied to Claude Code lifecycle events (SessionStart, SessionEnd).
• TRIGGERED ACTIONS: Automated TDD activation, artifact indexing, and post-session outcome tracking.

### 3. Isolated Agent Orchestration
• CONTEXT PURITY: Sub-agents are spawned with specific, clean context windows.
• HANDOFFS: Structured documents (`thoughts/shared/handoffs/`) transfer work between agents or sessions.

### 4. Artifact Indexing & Retrieval
• SQLITE + FTS5: Artifacts (plans, ledgers, handoffs) are indexed in a local database.
• SEMANTIC SEARCH: Enables "handoff search" to find relevant past context without manual exploration.

## ARCHITECTURAL ALIGNMENT
Our current implementation (`swarmtool-addons`) aligns with these patterns but evolves them for a TypeScript/Bun environment:
• NON-INVASIVE SIDECARS: We use OpenCode hooks to implement sidecar logic that doesn't block the main agent flow.
• EVENT-DRIVEN COORDINATION: Moving from script-based triggers to a more robust event bus (Swarm-Mail) and tool-execution hooks.
• MEMORY-LANE SYSTEM: Our version of the artifact index, using semantic storage and taxonomy for structured learning extraction.

## INSPIRATION POINTS FOR FUTURE WORK
• REASONING HISTORY: Capturing the "why" behind every git commit and major tool decision.
• OUTCOME-DRIVEN LEARNING: Systematic marking of SUCCEEDED/FAILED for every epic/task to inform future planning.
• TDD ACTIVATION: Seamlessly integrating test runs into the implementation workflow.

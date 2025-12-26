# Product Guide: Swarm Tool Addons

## Initial Concept
This project is an existing repository focused on building advanced addon modules for the [SwarmTools](https://www.swarmtools.ai) ecosystem. The core mission is to extend the learning, memory, and orchestration capabilities of swarm-based agents using Phil Schmid's Context Engineering principles and an Agent-as-Tool architectural pattern.

## Product Guide
### Target Audience
- **Agent Developers:** Engineers building autonomous, multi-agent systems who require persistent behavioral guidance (corrections, decisions, commitments).
- **AI Researchers:** Individuals experimenting with swarm coordination, actor-model communication, and context engineering optimization.

### Core Value Proposition
- **Persistent Behavioral Guidance:** Moves beyond simple semantic search to provide a "Memory Lane" that injects high-priority corrections and decisions into agent context.
- **Architectural Alignment:** Adheres to "Phil Schmid's Context Engineering" principles, prioritizing the **Agent-as-Tool** pattern and **Context Compaction** to maintain high model performance.
- **Non-Invasive Integration:** Designed as a sidecar plugin for OpenCode that hooks into SwarmTools events without creating upstream merge conflicts.

### Key Features
- **Memory Lane System:** A sophisticated persistent memory module with taxonomy-based extraction and hybrid dual-search (Entity + Semantic).
- **Event-Driven Hooks:** Automated learning extraction triggered by `swarm-mail` outcome events.
- **Context Engineering Suite:** Tools for transcript truncation, LLM-powered compaction, and hierarchical action space management (~20 tools per agent).
- **Skill-Based Architecture:** Each module is packaged as an OpenCode-compatible skill, enabling sub-agent orchestration for complex workflows.

### Distribution & Integration
Modules are designed for two primary integration paths:
1. **Plugin-First Sidecar:** A standalone OpenCode plugin that hooks into SwarmTools events non-invasively.
2. **Core Extension Library:** Composable modules that can be imported and registered directly within custom SwarmTools distributions.

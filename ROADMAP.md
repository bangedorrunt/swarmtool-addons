# Roadmap

This document outlines the vision and planned enhancements for `swarm-tool-addons`.

## 📍 Phase 1: Foundation (Stabilization) - COMPLETED

• [x] Implement **Skill-Based** agent discovery and loader.
• [x] Establish **Actor Model** isolation via sub-sessions.
• [x] Build **Durable Stream** continuity with `LEDGER.md`.
• [x] Implement **TaskSupervisor** for autonomous retries and health checks.
• [x] Establish comprehensive documentation architecture (Hub & Spoke).

## 🏗️ Phase 2: Enhanced Visibility & UX - PLANNED

• [ ] **Swarm Dashboard**: A local web UI or CLI visualizer to track active workers and LEDGER state in real-time.
• [ ] **Context Compaction 2.0**: Advanced summarization logic to preserve critical task-related context during session breaks.
• [ ] **Telemetry & Logging**: Improved event tracing for cross-agent communication (SwarmMail).

## 🧠 Phase 3: Knowledge & Learning - IN PROGRESS

• [ ] **Feedback Fine-tuning**: Use `memory_lane_feedback` signals to automatically adjust agent system prompts.
• [ ] **Automated Documentation**: Agents that proactively update the `SPEC.md` files as code changes.

## 🔨 Phase 4: Skill Expansion

• [ ] **frontend-ui-ux-engineer**: A designer-turned-developer agent with specific tools for CSS/Tailwind and visual validation.
• [ ] **Multi-Repo Librarian**: Ability for the librarian agent to search and analyze across multiple GitHub repositories simultaneously.
• [ ] **Security Guardian**: A specialized validator that runs static analysis tools (e.g., Semgrep) on every executor output.

---

_Last Updated: 2025-12-31_

# Product Guidelines: Swarm Tool Addons

## Documentation Standards

### 1. Technical Deep-Dives
All major modules MUST include a `DEEP_DIVE.md` or similar file that focuses on the "Why" behind the implementation. 
- **Decision Records:** Include Architectural Decision Records (ADRs) for non-obvious design choices.
- **Reference Material:** Link to the foundational research or external documentation (e.g., Phil Schmid's Context Engineering) that informed the implementation.

### 2. Visual Architecture
Documentation must prioritize visual clarity to explain complex multi-agent coordination.
- **ASCII Diagrams:** Use ASCII diagrams for flowcharts, sequence diagrams (especially for `swarm-mail` interactions), and state machines to ensure high accessibility and easy versioning.
- **Consistency:** Maintain a consistent style for different entity types (Agents, Stores, Hooks) across all diagrams.

### 3. Implementation Lore & Philosophy
Every "Skill" must be more than just a collection of tools; it must communicate its design philosophy.
- **SKILL.md Files:** Each skill directory MUST contain a `SKILL.md` that explains the high-level orchestration logic and how it adheres to the "Agent-as-Tool" pattern.
- **The Bitter Lesson:** Keep documentation grounded in the principle of "minimal complexity." Regularly question if a harness or piece of scaffolding has become obsolete due to model improvements.
- **Context Engineering:** Document how each module contributes to or respects the context compaction hierarchy (Raw > Compaction > Summarization).

## Technical Communication Tone
- **Professional & Precise:** Use industry-standard terminology (Event Sourcing, Actor Model, Durable Streams).
- **Direct & Grounded:** Avoid fluff; focus on actionable technical insights and clear implementation paths.

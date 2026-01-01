# swarm-tool-addons

This is an addon to leverage amazing swarm-tools features. It implements a robust, skill-based multi-agent orchestration system on top of OpenCode AI SDK.

> An OpenCode plugin created from the [opencode-plugin-template](https://github.com/zenobi-us/opencode-plugin-template)

## 🌟 Key Features

• 🏗️ **Skill-Based Subagent Architecture**: Package domain expertise into specialized, on-demand workers.
• 🏛️ **Governance-First Orchestration (v4.0)**: Explicit Directives (The Law) + Tracked Assumptions (The Debt) for drift prevention.
• 🔄 **Dual-Mode Orchestration**: Support for both Parallel (Async) interactive handoffs and Sequential (Sync) background delegation.
• 🧠 **Self-Learning Memory System**: Automatic cross-session wisdom accumulation via Memory Lane (Vector DB) + LEDGER.md.
• 📝 **Durable State Continuity**: `LEDGER.md` persists work across sessions with crash recovery built-in.
• 🛡️ **Autonomous Supervision**: Background watchdog (TaskSupervisor) for task health monitoring and auto-retries.
• 🔐 **Access Control**: Protected sub-agents only respond to chief-of-staff coordinator.
• 🚀 **High Context Efficiency**: Partitioned contexts reduce token noise by up to 16x per task.

## 🗺️ Documentation Map

• **[ARCHITECTURE.md](ARCHITECTURE.md)**: Core design philosophies (Actor Model, Durable Stream, Hybrid Delegator).
• **[ROADMAP.md](ROADMAP.md)**: Project vision and planned enhancements.
• **Module Specifications**:
  • [Orchestrator Spec](src/orchestrator/SPEC.md): Technical details of coordination and supervision.
  • [Memory Lane Spec](src/memory-lane/SPEC.md): Semantic storage and learning extraction details.
  • [OpenCode Integration](src/opencode/SPEC.md): Loader mechanism and runtime hooks.
  • [Durable Stream](src/durable-stream/README.md): Event-sourced state persistence and orchestration.

## 🚀 Quick Start

### 1. Installation in OpenCode

Create or edit `~/.config/opencode/config.json`:

```json
{
  "plugins": ["swarm-tool-addons"]
}
```

### 2. Basic Usage

Call specialized agents directly from your chat:

```typescript
// Async: User sees the interviewer's questions (DIALOGUE mode)
await skill_agent({ agent_name: 'interviewer', prompt: 'Clarify requirements', async: true });

// Sync: Coordinator gets the result text to use in next step
const plan = await skill_agent({ agent_name: 'planner', prompt: 'Create plan', async: false });

// Orchestrate complex tasks with chief-of-staff
await skill_agent({ agent_name: 'chief-of-staff', prompt: 'Build auth system with OAuth' });
```

## 🛠️ Development

- `mise run build` - Build the plugin
- `mise run test` - Run tests
- `mise run lint` - Lint code
- `mise run format` - Format code

## 📄 License

MIT License. See the [LICENSE](LICENSE) file for details.

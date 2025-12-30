# swarm-tool-addons

This is an addon to leverage amazing swarm-tools features

> An OpenCode plugin created from the [opencode-plugin-template](https://github.com/zenobi-us/opencode-plugin-template)

## Features

- 🏗️ TypeScript-based plugin architecture
- 🔧 Mise task runner integration
- 📦 Bun/npm build tooling
- ✨ ESLint + Prettier formatting
- 🧪 Vitest testing setup
- 🚀 GitHub Actions CI/CD
- 📝 Release automation with release-please
- 🔄 **Dual-mode orchestration (Sync/Async)** for robust agent coordination
- 🧠 **Self-learning memory system** with cross-session continuity
- 🎯 **Skill-based agent architecture** with hierarchical discovery

## Orchestration Patterns

This plugin implements two distinct orchestration modes for agent coordination:

### 🔀 Async (Parallel) - Interactive Handoffs
**Use Case**: User-facing interactions where the sub-agent's work should be visible in the UI.

- Coordinator hands off the turn to a specialist
- User sees the specialist's reasoning and can interact
- Ideal for clarification dialogues, interviews, and interactive planning

### 🔗 Sync (Sequential) - Durable Streams
**Use Case**: Background coordination where the coordinator needs the specialist's result to continue.

- Coordinator blocks and waits for the specialist to finish
- Specialist works in an isolated session (invisible to user)
- Coordinator receives the result as text and continues its logic
- Ideal for Chief-of-Staff workflows, multi-step planning, and result-dependent execution

**Example**:
```typescript
// Async: User sees the interviewer's questions
await skill_agent({ agent: 'interviewer', prompt: 'Clarify requirements', async: true });

// Sync: Coordinator gets the plan text to use in next step
const plan = await skill_agent({ agent: 'planner', prompt: 'Create plan', async: false });
```

See [docs/REFLECTION.md](docs/REFLECTION.md) for architectural deep-dive and [src/orchestrator/PLAN.md](src/orchestrator/PLAN.md) for implementation details.

## Getting Started

1. **Clone this template:**

   ```bash
   cp -r opencode-plugin-template your-plugin-name
   cd your-plugin-name
   ```

2. **Update package.json:**
   - Change `name` to your plugin name
   - Update `description`
   - Update `repository.url`

3. **Install dependencies:**

   ```bash
   bun install
   ```

4. **Implement your plugin in `src/index.ts`:**

   ```typescript
   import type { Plugin } from '@opencode-ai/plugin';

   export const YourPlugin: Plugin = async (ctx) => {
     return {
       tool: {
         // Your plugin tools here
       },
     };
   };
   ```

5. **Test your plugin:**
   ```bash
   mise run test
   ```

## Development

- `mise run build` - Build the plugin
- `mise run test` - Run tests
- `mise run lint` - Lint code
- `mise run lint:fix` - Fix linting issues
- `mise run format` - Format code with Prettier

## Installation in OpenCode

Create or edit `~/.config/opencode/config.json`:

```json
{
  "plugins": ["swarm-tool-addons"]
}
```

## Author

bangedorrunt <bangedorrunt@proton.me>

## Repository

https://github.com/bangedorrunt/swarm-tool-addons

## Contributing

Contributions are welcome! Please file issues or submit pull requests on the GitHub repository.

## License

MIT License. See the [LICENSE](LICENSE) file for details.

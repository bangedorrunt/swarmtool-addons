# Tech Stack: Swarm Tool Addons

## Core Runtime & Language
- **Language:** TypeScript (Strict mode)
- **Runtime:** Bun (Primary) / Node.js (Compatibility)
- **Package Manager:** Bun

## Swarm Tools Foundations (Upstream Alignment)
- **Messaging & Coordination:** Actor Model via `swarm-mail` (Durable Streams)
- **Persistence:** PGLite (Embedded PostgreSQL) for Event Logs and Materialized Views
- **Primitives:** Durable Mailboxes, Cursors, Locks, and Deferreds
- **Validation:** Zod (Runtime type safety)
- **Effect System:** Effect-TS (Functional primitives for durability)

## Addon Specific Frameworks
- **Plugin System:** `@opencode-ai/plugin` (OpenCode Plugin Framework)
- **Learning Persistence:** `semantic-memory` for behavioral guidance and pattern maturity

## Development & Quality Assurance
- **Task Runner:** Mise
- **Test Runner:** Vitest
- **Linting & Formatting:** ESLint (v9+) & Prettier
- **Monorepo/Build Tooling:** Turborepo (for upstream alignment)
- **CI/CD:** GitHub Actions with Release-Please automation

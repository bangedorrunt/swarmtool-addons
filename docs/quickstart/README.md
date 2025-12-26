# Quick Start: Build Your First OpenCode Plugin

> Get started with OpenCode plugin development in under 15 minutes

You'll build a **skill injection plugin** that adds domain knowledge to AI agents. This is the most common pattern for customizing OpenCode behavior without writing complex logic.

## What You'll Build

A plugin that provides agents with specialized knowledge for a specific domain (e.g., database migrations, API authentication, testing frameworks). The skill pattern injects this knowledge only when relevant—keeping agents general-purpose until your domain expertise is needed.

**Example use cases:**
- "Teach agents about your company's database schema"
- "Add knowledge about your authentication system"
- "Provide domain-specific API patterns"
- "Encode testing conventions for your tech stack"

## Prerequisites

Before starting, ensure you have:

| Requirement | Why | Check |
|-------------|-----|-------|
| **Node.js 20+** | Plugin ecosystem | `node --version` |
| **OpenCode installed** | Run your plugin | See [opencode.ai](https://opencode.ai) |
| **Bun 1.0+** | Build tool (fast) | `bun --version` |
| **npm account** | Publish plugin (optional) | `npm whoami` |

**Time estimate:** ~15 minutes total

## Component Overview

An OpenCode plugin has three main parts:

```
my-plugin/
├── package.json          # Plugin manifest + dependencies
├── plugin.ts             # Tool definitions (thin wrapper)
├── skills/               # Domain knowledge (YOUR code)
│   └── my-skill/
│       └── SKILL.md     # Instructions for agents
└── bin/
    └── my-cli.ts        # CLI for tool execution
```

### How It Works

1. **OpenCode loads plugin.ts** - Discovers available tools via `export default plugin(...)`
2. **Agent requests tool** - Agent calls your tool with arguments
3. **plugin.ts routes to CLI** - Tool calls your CLI binary
4. **CLI executes logic** - Your code runs (read files, query APIs, etc.)
5. **Result returned** - Output goes back to agent as context

### The Skill Pattern (What You'll Build)

Skills are markdown files with YAML frontmatter that agents load dynamically:

```yaml
---
name: my-skill
description: Teach agents about X domain
---

# My Skill

## When to Use
- When working with X files
- When user asks about Y

## Instructions
1. Always do A first
2. Then handle edge case B
```

When an agent loads this skill, it gains your domain knowledge immediately—no code changes required.

---

## Navigation

This quickstart is divided into three sections:

| Section | Time | What You'll Learn |
|---------|------|-------------------|
| **[1. Setup Project](./01-project-setup.md)** | 3 min | Initialize plugin project with package.json, TypeScript, and build configuration |
| **[2. Plugin Entry](./02-plugin-entry.md)** | 5 min | Create tool definitions, register hooks, and understand plugin.ts structure |
| **[3. Skills Example](./03-skills-example.md)** | 5 min | Build a complete skill with frontmatter, instructions, and optional resources |

---

## Why Skills?

Skills are the **quickest way to customize OpenCode** because:

1. **No complex logic** - Just markdown + YAML frontmatter
2. **Testable immediately** - Load skill in any OpenCode session
3. **Reusable** - Skills work across all agents (not just your plugin)
4. **Maintainable** - Update knowledge without rebuilding plugin

**Alternative patterns** (for advanced use cases):
- **Tool execution** - Run code when agent triggers (e.g., API calls, file generation)
- **Event hooks** - React to agent lifecycle (on load, on complete)
- **Swarm coordination** - Multi-agent decomposition (see [swarm-coordination skill](https://github.com/swarmtools/swarm-tools/tree/main/packages/opencode-swarm-plugin/global-skills/swarm-coordination))

These require more code and are covered in advanced guides. Start with skills—you can always add tool hooks later.

---

## Get Started

Ready to build? Begin with **[Section 1: Setup Project](./01-project-setup.md)** →

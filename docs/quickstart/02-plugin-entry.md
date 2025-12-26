# Plugin Entry Point

The `plugin.ts` file is the heart of your OpenCode plugin. This is where you register tools, define hooks, and tell OpenCode what your plugin can do.

## The Golden Rule: Export Only Functions

**CRITICAL:** Your `plugin.ts` file must **only export functions**. OpenCode's plugin loader calls ALL exports as functions during initialization. Exporting classes, constants, or non-function values will cause cryptic errors.

### ✅ Correct

```typescript
import { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  return {
    tool: {
      // Your tools here
    },
  };
};

export default MyPlugin;
```

### ❌ Wrong

```typescript
export const VERSION = "1.0.0";  // ❌ Not a function!
export class Helper {}              // ❌ Not a function!
```

## Minimal Plugin

Here's the simplest working plugin:

```typescript
import { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

/**
 * My First Plugin
 */
export const MyPlugin: Plugin = async (
  input: PluginInput,
): Promise<Hooks> => {
  return {
    tool: {},
  };
};

export default MyPlugin;
```

## Registering Tools with `tool()` Helper

The `tool()` helper from `@opencode-ai/plugin` creates type-safe, validated tools:

```typescript
import { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async (
  input: PluginInput,
): Promise<Hooks> => {
  // Define a simple greeting tool
  const greet = tool({
    description: "Greet the user with a personalized message",
    args: {
      name: tool.schema.string().describe("Name of the person to greet"),
      enthusiastic: tool.schema
        .boolean()
        .optional()
        .describe("Whether to add enthusiasm"),
    },
    async execute(args, ctx) {
      const { name, enthusiastic = false } = args;
      const message = enthusiastic
        ? `Hello ${name}! It's SO great to see you! 🎉`
        : `Hello ${name}.`;
      return message;
    },
  });

  return {
    tool: {
      greet,
    },
  };
};

export default MyPlugin;
```

### Tool Schema Options

The `tool()` helper uses a schema builder for type-safe argument validation:

```typescript
const myTool = tool({
  description: "Tool description",
  args: {
    // String field (required)
    requiredString: tool.schema.string().describe("Required string"),

    // String field (optional)
    optionalString: tool.schema
      .string()
      .optional()
      .describe("Optional string"),

    // Number field with range
    count: tool.schema
      .number()
      .min(0)
      .max(100)
      .describe("Count between 0-100"),

    // Boolean field
    enabled: tool.schema.boolean().describe("Enable feature"),

    // Enum field
    mode: tool.schema
      .enum(["fast", "slow", "auto"])
      .describe("Operation mode"),

    // Array of strings
    tags: tool.schema
      .array(tool.schema.string())
      .describe("List of tags"),
  },
  async execute(args, ctx) {
    // TypeScript knows the types of args
    console.log(args.requiredString);  // string
    console.log(args.count);           // number
    console.log(args.enabled);         // boolean
    return "result";
  },
});
```

## Plugin Context: What You Get

Your plugin function receives a `PluginInput` object with useful context:

```typescript
export const MyPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const { $, directory } = input;

  // $ - Shell execution helper (from Bun)
  const result = await $`echo "Hello from plugin"`.text();

  // directory - Project directory where plugin is running
  console.log(`Running in: ${directory}`);

  return {
    tool: {},
  };
};
```

## Complete Working Example

Here's a complete plugin with a greeting tool and some context:

```typescript
import { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

/**
 * Greeting Plugin
 *
 * A simple plugin that greets users and shows the current directory.
 */
export const GreetingPlugin: Plugin = async (
  input: PluginInput,
): Promise<Hooks> => {
  const { directory } = input;

  // Tool 1: Greet by name
  const greet = tool({
    description: "Greet the user with a personalized message",
    args: {
      name: tool.schema.string().describe("Name of the person to greet"),
      enthusiastic: tool.schema
        .boolean()
        .optional()
        .describe("Whether to add enthusiasm"),
    },
    async execute(args, ctx) {
      const { name, enthusiastic = false } = args;
      const message = enthusiastic
        ? `Hello ${name}! It's SO great to see you! 🎉`
        : `Hello ${name}.`;
      return message;
    },
  });

  // Tool 2: Show current directory
  const whereami = tool({
    description: "Show the current working directory",
    args: {},
    async execute(args, ctx) {
      return `Current directory: ${directory}`;
    },
  });

  return {
    tool: {
      greet,
      whereami,
    },
  };
};

export default GreetingPlugin;
```

## File Structure

For a well-organized plugin:

```
my-plugin/
├── src/
│   ├── plugin.ts        # Entry point (only exports plugin function)
│   ├── index.ts        # Re-exports utilities for external use
│   └── tools/
│       └── greet.ts    # Tool implementations
├── package.json
└── tsconfig.json
```

**Key point:** Export utilities from `index.ts`, NOT from `plugin.ts`:

```typescript
// ✅ CORRECT - src/plugin.ts
import { greet, whereami } from "./tools";

export const MyPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  return {
    tool: {
      greet,
      whereami,
    },
  };
};

export default MyPlugin;

// ✅ CORRECT - src/index.ts
export { greet, whereami } from "./tools";
export type { GreetArgs } from "./tools";

// ❌ WRONG - Don't export from plugin.ts!
export { greet, whereami } from "./tools";  // Plugin loader will try to call these as functions!
```

## What's Next?

- [03-skills-example.md](./03-skills-example.md) - See a complete skill example with full structure

## Common Pitfalls

### Exporting Constants

```typescript
// ❌ WRONG
export const VERSION = "1.0.0";

// ✅ CORRECT
// Don't export constants from plugin.ts. Use index.ts instead.
```

### Exporting Classes

```typescript
// ❌ WRONG
export class MyHelper {}

// ✅ CORRECT
// Export classes from index.ts, not plugin.ts
```

### Forgetting Default Export

```typescript
// ❌ WRONG - No default export!
export const MyPlugin: Plugin = async (...) => { ... };

// ✅ CORRECT
export const MyPlugin: Plugin = async (...) => { ... };
export default MyPlugin;
```

## Testing Your Plugin

Load your plugin in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugins": ["my-plugin"]
}
```

Then ask Claude to use your tool:

> "Use the greet tool to say hello to Alice, and make it enthusiastic!"

## Reference

- **[@opencode-ai/plugin API](https://github.com/opencode-ai/opencode)** - Full plugin API reference
- **[01-project-setup.md](./01-project-setup.md)** - Project initialization and structure
- **[03-skills-example.md](./03-skills-example.md)** - Complete skill examples

## Troubleshooting

**"Plugin fails to load with cryptic error"**

Check that you're only exporting functions from `plugin.ts`:

```typescript
// ❌ WRONG - Exporting constants or classes
export const VERSION = "1.0.0";
export class Helper {}

// ✅ CORRECT - Only export plugin function
export const MyPlugin: Plugin = async (...) => { ... };
export default MyPlugin;
```

**"Tool not available in OpenCode"**

1. Verify you added the tool to the `tool` registry in your `Hooks` return:
   ```typescript
   return {
     tool: {
       greet,  // Must be here!
     },
   };
   ```
2. Check that you exported the tool function from your module
3. Rebuild your plugin: `bun run build`

**"TypeScript errors with tool() helper"**

Make sure you're using the correct schema syntax:

```typescript
// ❌ WRONG - Old API with object syntax
args: {
  name: {
    type: tool.schema.string(),
    description: "Name",
  },
}

// ✅ CORRECT - New API with chain syntax
args: {
  name: tool.schema.string().describe("Name"),
}
```

**"Can't access directory in tool"**

The `directory` is available in the `PluginInput`, not in each tool:

```typescript
export const MyPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const { directory } = input;  // ✅ Get it here

  const myTool = tool({
    async execute(args, ctx) {
      // directory is NOT available here
      // Store it in a closure if you need it:
    },
  });
};
```

## Summary

1. **Export only functions** from `plugin.ts` - OpenCode calls all exports
2. **Use the `tool()` helper** for type-safe, validated tools
3. **Return a `Hooks` object** with your `tool` registry
4. **Use `index.ts`** for re-exports (utilities, types, etc.)
5. **Don't forget the default export** for plugin loading

Now let's build something useful with skill injection!

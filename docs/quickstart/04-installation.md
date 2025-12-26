# Installing and Testing Your Plugin

After building your plugin, you need to install it in OpenCode and verify it works correctly. This guide covers local development setup and (optional) npm publishing.

## Local Development Setup

For active development, use one of these approaches to load your plugin without publishing to npm.

### Option 1: npm link (Recommended)

Link your local plugin to OpenCode globally:

```bash
# In your plugin directory
cd /path/to/your-plugin
npm link

# Link to OpenCode
npm link your-plugin-name -g
```

OpenCode will now load your local plugin version.

### Option 2: Install from local path

Install directly from your plugin directory:

```bash
npm install -g /path/to/your-plugin

# Or with Bun
bun add -g /path/to/your-plugin
```

### Option 3: Use workspace (if developing in monorepo)

If your plugin is part of a workspace:

```bash
npm install -g your-plugin-name
```

OpenCode will use the `workspace:*` version if it exists.

## Configuring OpenCode

OpenCode loads plugins from `opencode.jsonc` configuration file.

### Create/Update opencode.jsonc

Create `~/.config/opencode/opencode.jsonc` (or `~/Library/Application Support/opencode/opencode.jsonc` on macOS):

```jsonc
{
  "plugins": [
    "your-plugin-name"
  ]
}
```

**Key requirements:**
- Use your package's `name` field from `package.json`
- Must match the npm package name
- Array of plugin names (not paths)

### Plugin Loading Rules

OpenCode loads plugins by their default export:

```typescript
// Your package.json
{
  "name": "my-opencode-plugin",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}

// Your dist/index.js MUST export a function
export { MyPlugin } from "./plugin.js";

// dist/plugin.js - ONLY export the plugin function!
export const MyPlugin = async (input) => {
  // Return hooks: { tools: [...], events: {...} }
};
```

**Critical:** Only export the plugin function from your entry point. Exporting classes, constants, or non-function values will break plugin loading with cryptic errors.

### Verify Configuration

OpenCode loads plugins at startup. Check the console for errors:

```bash
# Restart OpenCode to reload plugins
# Look for errors like:
# - "Failed to load plugin my-opencode-plugin"
# - "Plugin my-opencode-plugin is not a function"
```

## Verification Steps

After installation, verify your plugin is loaded correctly.

### Step 1: Check Plugin List

In OpenCode, ask for available tools:

```
List all available tools
```

You should see tools from your plugin. If not, check:
- Plugin name in `opencode.jsonc` matches `package.json` name
- Plugin exports a function (default export)
- No console errors on OpenCode startup

### Step 2: Test a Tool

Pick a simple tool and test it:

```
Use my_opencode_tool and explain what it does
```

Expected behavior:
- Tool executes without errors
- Returns valid response
- Tools are type-safe (Zod validation catches bad inputs)

### Step 3: Check Tool Registration

Tools are registered by their function name:

```typescript
// In your plugin
export const myPlugin = async () => {
  return {
    tools: [
      {
        my_custom_tool: {  // ← This becomes the tool name
          description: "Does something cool",
          args: { /* Zod schema */ },
          execute: async (args) => { /* ... */ }
        }
      }
    ]
  };
};
```

In OpenCode, you call it as `my_custom_tool` (not `myPlugin_my_custom_tool`).

### Step 4: Verify Skills Loading

If your plugin includes skills:

```typescript
// Skills discovered from these directories:
// - .opencode/skills/
// - .claude/skills/
// - skills/
```

In OpenCode:

```
List available skills
```

You should see your plugin's bundled skills listed.

## Common Issues

### "Plugin not found"

**Symptom:** OpenCode reports plugin doesn't exist

**Fixes:**
- Verify package name in `opencode.jsonc` matches `package.json`
- Run `npm link` or `npm install -g` to make package available
- Check `npm list -g --depth=0` for installed packages

### "Plugin is not a function"

**Symptom:** Plugin fails to load with "is not a function" error

**Fixes:**
- Ensure `package.json` `main` field points to correct entry
- Verify entry point only exports functions (no classes/constants)
- Check dist files were built successfully: `npm run build`

### "Tools not appearing"

**Symptom:** Plugin loads but tools aren't listed

**Fixes:**
- Verify tools are returned in the `tools` array from plugin function
- Check tool objects have `description`, `args`, and `execute` fields
- Restart OpenCode after making changes

### Changes not reflected

**Symptom:** Plugin changes don't appear in OpenCode

**Fixes:**
- Rebuild plugin: `npm run build`
- If using npm link, re-link after rebuild
- Restart OpenCode completely (not just re-connecting to session)

## npm Publishing (Optional)

Once your plugin is stable, publish to npm for wider use.

### Pre-publish Checklist

- [ ] `package.json` has `name`, `version`, `main`, `types`
- [ ] `exports` field maps to correct entry points
- [ ] `publishConfig.access` is `"public"` for public packages
- [ ] Build output exists in `dist/`
- [ ] Tested locally with `npm link`
- [ ] README.md with installation instructions

### Publishing Commands

```bash
# Build distribution
npm run build

# Check what will be published (dry run)
npm pack --dry-run

# Publish to npm
npm publish
```

### Version Management

Use semantic versioning:

- **patch** (0.0.1 → 0.0.2): Bug fixes, no breaking changes
- **minor** (0.0.1 → 0.1.0): New features, backward compatible
- **major** (0.0.1 → 1.0.0): Breaking changes

```bash
# Bump version in package.json
npm version patch

# Publish
npm publish
```

Users install with:

```bash
npm install -g your-plugin-name@latest

# Or specific version
npm install -g your-plugin-name@1.2.3
```

### Private Packages

For internal plugins, publish to private registry:

```json
// package.json
{
  "publishConfig": {
    "access": "restricted",
    "registry": "https://your-registry.com/npm"
  }
}
```

Install with:

```bash
npm install -g your-plugin-name --registry=https://your-registry.com/npm
```

## Development Workflow

Recommended workflow for plugin development:

```bash
# 1. Make changes to source
vim src/plugin.ts

# 2. Build
npm run build

# 3. Test locally (re-link if using npm link)
npm link

# 4. Verify in OpenCode
# - Restart OpenCode
# - Test tools
# - Check skills

# 5. Iterate
# - Repeat steps 1-4 until stable

# 6. Publish when ready
npm version patch
npm publish
```

## Reference Implementation

See [opencode-swarm-plugin](https://github.com/joelhooks/swarm-tools) for a complete example:

- **Entry point:** `src/plugin.ts` - Only exports plugin function
- **Plugin logic:** `src/index.ts` - Returns hooks with 40+ tools
- **package.json:** Correct main/exports configuration
- **Skills:** Bundled skills in `global-skills/` directory

## What's Next

- [01 - Project Setup](./01-project-setup.md) - Initial plugin structure
- [02 - Plugin Entry](./02-plugin-entry.md) - Writing your plugin function
- [03 - Skills Example](./03-skills-example.md) - Creating skills for domain knowledge
- [05 - Next Steps](./05-next-steps.md) - Where to go from here

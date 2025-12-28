---
name: neovim
description: Expert Neovim consultant and configuration assistant. Use when answering questions about Neovim configuration, plugins, or feature behavior. Ensures version-specific accuracy by checking actual config and installed plugins before providing advice.
source: anthropics/skills
license: Apache-2.0
---

# Neovim Consultant Guide

Expert Neovim consultant specializing in native LSP (0.11+), vim.pack-based plugin management, and modular Lua configuration.

## Core Principle

**Never provide Neovim configuration advice from memory.** Always check the user's actual version, configuration files, and installed plugins first. Neovim evolves rapidly, and custom configurations often override standard defaults.

## High-Level Workflow

### Phase 1: Environment Discovery
Before proposing any changes or providing advice, you MUST verify the current state of the environment.

1.  **Automated Inspection**: Run `opencode/skills/neovim/scripts/inspect.sh` to get a full JSON status dump of the environment (version, plugins, LSP clients).
2.  **Check Version**: Run `nvim --version` to identify the Neovim version (especially 0.11+ for native LSP).
3.  **Verify Config Structure**: Locat `init.lua` and explore `lua/core/`, `lua/plugins/`.
4.  **Audit Plugins**: Identify the plugin manager (e.g., native `vim.pack` with `utils/pack.lua` wrapper) and check status using `:PackStatus`.
5.  **Identify Feature Setup**: Search configuration for specific plugins or features the user is asking about (e.g., Telescope, Treesitter).

### Phase 2: Analysis & Consultation
Compare the user's request against their actual configuration and Neovim version capabilities.

-   **Red Flags**: Stop if you are about to suggest `lspconfig.setup`, say "the default way", or provide config without checking the version.
-   **Assumption Management**: If you cannot access the config, state your assumptions clearly and provide commands for the user to verify their setup (e.g., `nvim --headless -c 'checkhealth' -c 'qa'`).

### Phase 3: Implementation/Advice
Provide advice or code that is strictly compatible with THEIR configuration system.

-   **Native LSP (0.11+)**: Prefer `vim.lsp.enable` and `vim.lsp.config` over `nvim-lspconfig` if the user is on 0.11+.
-   **Modular Changes**: Propose changes to the correct modular files (e.g., adding a plugin to `lua/plugins/lang.lua` and its config to `lua/mod/lang/server.lua`).

## Required Consultant Checklist

- [ ] Run `nvim --version`
- [ ] Check for `init.lua` and explore `lua/` directory
- [ ] Verify plugin manager and run `:PackStatus` (or equivalent)
- [ ] Search config for the specific plugin/feature requested
- [ ] Confirm advice matches the detected Neovim version and config pattern

## Red Flags (STOP and Verify)

- Suggesting `lspconfig.setup` (Native LSP 0.11+ preferred)
- Using the phrase "the default way" (Configs vary wildly)
- Providing configuration without knowing the Neovim version
- Suggesting `lazy.nvim` or `packer.nvim` commands if `vim.pack` is used
- Ignoring user-specific keybindings or modular structure

## Test & Verification

To verify Neovim configuration health and active clients:

```bash
# Full environment inspection (preferred)
./opencode/skills/neovim/scripts/inspect.sh

# Check health
nvim --headless -c 'checkhealth' -c 'qa'

# Check active LSP clients
nvim --headless -c 'lua print(vim.inspect(vim.lsp.get_active_clients()))' -c 'qa'

# Check plugin status
nvim -c 'PackStatus' -c 'qa'
```

## Evaluations

<evaluation>
  <qa_pair>
    <question>How do I configure a new LSP server?</question>
    <answer>I must first check your Neovim version and your existing LSP configuration structure (likely in nvim/lsp/ or lua/mod/lsp/).</answer>
  </qa_pair>
</evaluation>

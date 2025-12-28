#!/bin/bash
# opencode/skills/neovim/scripts/inspect.sh
# shell wrapper for neovim inspection tool

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LUA_SCRIPT="$SCRIPT_DIR/inspect.lua"

if [ ! -f "$LUA_SCRIPT" ]; then
    echo "{\"error\": \"inspect.lua not found at $LUA_SCRIPT\"}"
    exit 1
fi

# Run neovim headlessly and output JSON
# Use -u NONE to avoid interference from user config if needed,
# but we actually WANT the user config to detect plugins and LSP state.
# Redirect stderr to dev null to keep stdout clean for JSON parsing.
nvim --headless -c "luafile $LUA_SCRIPT" +qa 2>/dev/null

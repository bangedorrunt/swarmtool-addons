-- opencode/skills/neovim/scripts/inspect.lua
-- automates neovim environment discovery

local function get_plugins()
  local plugins = {}
  if vim.pack and vim.pack.get then
    for _, plugin in ipairs(vim.pack.get()) do
      table.insert(plugins, {
        name = plugin.spec.name,
        src = plugin.spec.src or plugin.spec.url,
        version = plugin.spec.version,
      })
    end
  end
  return plugins
end

local function get_lsp_clients()
  local clients = {}
  local get_clients = vim.lsp.get_clients or vim.lsp.get_active_clients
  if get_clients then
    for _, client in ipairs(get_clients()) do
      table.insert(clients, {
        id = client.id,
        name = client.name,
        root_dir = client.config.root_dir,
        filetypes = client.config.filetypes,
        attached_buffers = vim.lsp.get_buffers_by_client_id(client.id),
      })
    end
  end
  return clients
end

local function get_buffer_info()
  return {
    bufnr = vim.api.nvim_get_current_buf(),
    name = vim.api.nvim_buf_get_name(0),
    filetype = vim.bo.filetype,
    buftype = vim.bo.buftype,
    line_count = vim.api.nvim_buf_line_count(0),
  }
end

local function get_health()
  local config_dir = vim.fn.stdpath("config")
  local init_lua = config_dir .. "/init.lua"
  local init_vim = config_dir .. "/init.vim"
  
  return {
    ok = true,
    message = "neovim is responsive",
    init_lua_exists = vim.fn.filereadable(init_lua) == 1,
    init_vim_exists = vim.fn.filereadable(init_vim) == 1,
  }
end

local info = {
  version = vim.version(),
  plugins = get_plugins(),
  lsp = {
    clients = get_lsp_clients(),
  },
  buffer = get_buffer_info(),
  env = {
    config = vim.fn.stdpath("config"),
    data = vim.fn.stdpath("data"),
    state = vim.fn.stdpath("state"),
    cache = vim.fn.stdpath("cache"),
    cwd = vim.fn.getcwd(),
  },
  health = get_health(),
}

io.write(vim.json.encode(info) .. "\n")

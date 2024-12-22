# Neovim MCP Server

A proof of concept integration between Claude Desktop and Neovim using Model Context Protocol (MCP) and the official neovim/node-client JavaScript library. This demo leverages Vim's native text editing commands and workflows, which Claude already understands, to create a lightweight code assistance layer.

<a href="https://glama.ai/mcp/servers/s0fywdwp87"><img width="380" height="200" src="https://glama.ai/mcp/servers/s0fywdwp87/badge" alt="mcp-neovim-server MCP server" /></a>

## Features

- Connects to your nvim instance if you expose `--listen /tmp/nvim` when starting nvim
- Views your current buffer
- Gets cursor location, mode, file name
- Runs vim commands
- Can make edits using insert or replacement

## API

### Resources

- `nvim://session`: Current neovim text editor session

### Tools
- **vim_buffer**
  - Current VIM text editor buffer with line numbers shown
  - Input `filename` (string)
  - Filename is ignored, returns a string of numbered lines with the current active buffer content
- **vim_command**
  - Send a command to VIM for navigation, spot editing, and line deletion.
  - Input `command` (string)
  - Runs a vim command first passed through `nvim.replaceTermcodes`. Multiple commands will work if separated by newlines.
  - On error, `'nvim:errmsg'` contents are returned 
- **vim_status**
  - Get the status of the VIM editor
  - Status contains line, col, mode, filename, and visual selection
- **vim_edit**
  - Edit lines using insert or replace in the VIM editor.
  - Input `startLine` (number), `mode` (`"insert"` | `"replace"`), `lines` (string)
  - insert will insert lines at startLine. replace will replace lines starting at the startLine to the end of the buffer.

Using this simple set of tools, Claude can peer into your neovim session to answer questions as well as make edits to the buffer.

## Limitations

- This is a quick proof of concept to experiment with Model Context Protocol. Use at your own risk.
- May not interact well with a custom neovim config!
- It may or may not be properly handling the socket connections to neovim.
- Error handling could be better.
- Sometimes Claude doesn't get the vim command input just right or the way I am passing it along doesn't agree.
- Reading the output from a vim command needs improvement.
- Support for multiple buffers/windows.

## Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "MCP Neovim Server": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-neovim-server"
      ]
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

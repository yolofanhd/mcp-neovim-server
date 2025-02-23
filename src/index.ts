#!/usr/bin/env node

/**
 * This is an MCP server that connect to neovim.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { NeovimManager } from "./neovim.js";

const server = new Server(
  {
    name: "mcp-neovim-server",
    version: "0.3.1"
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    },
  }
);

const neovimManager = NeovimManager.getInstance();

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: `nvim://session`,
        mimeType: "text/plain",
        name: "Current neovim session",
        description: `Current neovim text editor session`
      },
      {
        uri: `nvim://buffers`,
        mimeType: "application/json",
        name: "Open Neovim buffers",
        description: "List of all open buffers in the current Neovim session"
      }
    ]
  };
});


server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!request.params.uri.startsWith("nvim://")) {
    throw new Error("Invalid resource URI");
  }

  const resourcePath = request.params.uri.substring(6); // Remove "nvim://"

  if (resourcePath === "session") {
    const bufferContents = await neovimManager.getBufferContents();
    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "text/plain",
        text: Array.from(bufferContents.entries())
          .map(([lineNum, lineText]) => `${lineNum}: ${lineText}`)
          .join('\n')
      }]
    };
  } else if (resourcePath === "buffers") {
    const openBuffers = await neovimManager.getOpenBuffers();
    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(openBuffers, null, 2)
      }]
    };
  }

  throw new Error("Invalid resource path");
});

const VIM_BUFFER: Tool = {
  name: "vim_buffer",
  description: "Current VIM text editor buffer with line numbers shown",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "File name to edit (can be empty, assume buffer is already open)"
      }
    },
    required: []
  }
};

const VIM_COMMAND: Tool = {
  name: "vim_command",
  description: "Send a command to VIM for navigation, spot editing, and line deletion. For shell commands like ls, use without the leading colon (e.g. '!ls' not ':!ls').",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Neovim command to enter for navigation and spot editing. For shell commands use without leading colon (e.g. '!ls'). Insert <esc> to return to NORMAL mode. It is possible to send multiple commands separated with <cr>."
      }
    },
    required: ["command"]
  }
};

const VIM_STATUS: Tool = {
  name: "vim_status",
  description: "Get the status of the VIM editor",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "File name to get status for (can be empty, assume buffer is already open)"
      }
    },
    required: []
  }
};

const VIM_EDIT: Tool = {
  name: "vim_edit",
  description: "Edit lines using insert or replace in the VIM editor.",
  inputSchema: {
    type: "object",
    properties: {
      startLine: {
        type: "number",
        description: "Line number to start editing"
      },
      mode: {
        type: "string",
        enum: ["insert", "replace"],
        description: "Mode for editing lines. insert will insert lines at startLine. replace will replace lines starting at the startLine to the end of the buffer."
      },
      lines: {
        type: "string",
        description: "Lines of strings to insert or replace"
      }
    },
    required: ["startLine", "mode", "lines"]
  }
};

const VIM_WINDOW: Tool = {
  name: "vim_window",
  description: "Manipulate Neovim windows (split, close, navigate)",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Window command (split, vsplit, only, close, wincmd h/j/k/l)",
        enum: ["split", "vsplit", "only", "close", "wincmd h", "wincmd j", "wincmd k", "wincmd l"]
      }
    },
    required: ["command"]
  }
};

const VIM_MARK: Tool = {
  name: "vim_mark",
  description: "Set a mark at a specific position",
  inputSchema: {
    type: "object",
    properties: {
      mark: {
        type: "string",
        description: "Mark name (a-z)",
        pattern: "^[a-z]$"
      },
      line: {
        type: "number",
        description: "Line number"
      },
      column: {
        type: "number",
        description: "Column number"
      }
    },
    required: ["mark", "line", "column"]
  }
};

const VIM_REGISTER: Tool = {
  name: "vim_register",
  description: "Set content of a register",
  inputSchema: {
    type: "object",
    properties: {
      register: {
        type: "string",
        description: "Register name (a-z or \")",
        pattern: "^[a-z\"]$"
      },
      content: {
        type: "string",
        description: "Content to store in register"
      }
    },
    required: ["register", "content"]
  }
};

const VIM_VISUAL: Tool = {
  name: "vim_visual",
  description: "Make a visual selection",
  inputSchema: {
    type: "object",
    properties: {
      startLine: {
        type: "number",
        description: "Starting line number"
      },
      startColumn: {
        type: "number",
        description: "Starting column number"
      },
      endLine: {
        type: "number",
        description: "Ending line number"
      },
      endColumn: {
        type: "number",
        description: "Ending column number"
      }
    },
    required: ["startLine", "startColumn", "endLine", "endColumn"]
  }
};

const NEOVIM_TOOLS = [
  VIM_BUFFER,
  VIM_COMMAND,
  VIM_STATUS,
  VIM_EDIT,
  VIM_WINDOW,
  VIM_MARK,
  VIM_REGISTER,
  VIM_VISUAL
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: NEOVIM_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "vim_buffer": {
      return await handleBuffer();
    }
    case "vim_command": {
      const command = (request.params.arguments as { command: string }).command;

      return await handleCommand(command);
    }
    case "vim_status": {
      return await handleStatus();
    }
    case "vim_edit": {
      const { startLine, mode, lines } = request.params.arguments as { startLine: number, mode: 'insert' | 'replace', lines: string };
      console.error(`Editing lines: ${startLine}, ${mode}, ${lines}`);
      const result = await neovimManager.editLines(startLine, mode, lines);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }
    case "vim_window": {
      const { command } = request.params.arguments as { command: string };
      const result = await neovimManager.manipulateWindow(command);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }
    case "vim_mark": {
      const { mark, line, column } = request.params.arguments as { mark: string; line: number; column: number };
      const result = await neovimManager.setMark(mark, line, column);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }
    case "vim_register": {
      const { register, content } = request.params.arguments as { register: string; content: string };
      const result = await neovimManager.setRegister(register, content);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }
    case "vim_visual": {
      const { startLine, startColumn, endLine, endColumn } = request.params.arguments as {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
      };
      const result = await neovimManager.visualSelect(startLine, startColumn, endLine, endColumn);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }
    default:
      throw new Error("Unknown tool");
  }
});

async function handleCommand(command: string) {
  console.error(`Executing command: ${command}`);
  
  // Check if this is a shell command
  if (command.startsWith('!')) {
    const allowShellCommands = process.env.ALLOW_SHELL_COMMANDS === 'true';
    if (!allowShellCommands) {
      return {
        content: [{
          type: "text",
          text: "Shell command execution is disabled. Set ALLOW_SHELL_COMMANDS=true environment variable to enable shell commands."
        }]
      };
    }
  }

  const result = await neovimManager.sendCommand(command);
  return {
    content: [{
      type: "text", 
      text: result
    }]
  };
}

async function handleBuffer() {
  const bufferContents = await neovimManager.getBufferContents();

  return {
    content: [{
      type: "text",
      text: Array.from(bufferContents.entries())
        .map(([lineNum, lineText]) => `${lineNum}: ${lineText}`)
        .join('\n')
    }]
  };
}

async function handleStatus() {
  const status = await neovimManager.getNeovimStatus();
  return {
    content: [{
      type: "text",
      text: JSON.stringify(status)
    }]
  };
}

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

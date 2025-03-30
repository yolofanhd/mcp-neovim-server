#!/usr/bin/env node

/**
 * This is an MCP server that connects to neovim.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NeovimManager } from "./neovim.js";
import { z } from "zod";

const server = new McpServer(
  {
    name: "mcp-neovim-server",
    version: "0.4.1"
  }
);

const neovimManager = NeovimManager.getInstance();

// Register resources
server.resource(
  "session",
  new ResourceTemplate("nvim://session", { 
    list: () => ({
      resources: [{
        uri: "nvim://session",
        mimeType: "text/plain",
        name: "Current neovim session",
        description: "Current neovim text editor session"
      }]
    })
  }),
  async (uri) => {
    const bufferContents = await neovimManager.getBufferContents();
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: Array.from(bufferContents.entries())
          .map(([lineNum, lineText]) => `${lineNum}: ${lineText}`)
          .join('\n')
      }]
    };
  }
);

server.resource(
  "buffers",
  new ResourceTemplate("nvim://buffers", { 
    list: () => ({
      resources: [{
        uri: "nvim://buffers",
        mimeType: "application/json",
        name: "Open Neovim buffers",
        description: "List of all open buffers in the current Neovim session"
      }]
    })
  }),
  async (uri) => {
    const openBuffers = await neovimManager.getOpenBuffers();
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(openBuffers, null, 2)
      }]
    };
  }
);

// Register tools with proper parameter schemas
server.tool(
  "vim_buffer",
  { filename: z.string().optional().describe("Optional file name to view a specific buffer") },
  async ({ filename }) => {
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
);

server.tool(
  "vim_command",
  { command: z.string().describe("Vim command to execute (use ! prefix for shell commands if enabled)") },
  async ({ command }) => {
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
);

server.tool(
  "vim_status",
  { filename: z.string().optional().describe("Optional file name to get status for a specific buffer") },
  async () => {
    const status = await neovimManager.getNeovimStatus();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(status)
      }]
    };
  }
);

server.tool(
  "vim_edit",
  { 
    startLine: z.number().describe("The line number where editing should begin (1-indexed)"),
    mode: z.enum(["insert", "replace", "replaceAll"]).describe("Whether to insert new content, replace existing content, or replace entire buffer"),
    lines: z.string().describe("The text content to insert or use as replacement")
  },
  async ({ startLine, mode, lines }) => {
    console.error(`Editing lines: ${startLine}, ${mode}, ${lines}`);
    const result = await neovimManager.editLines(startLine, mode, lines);
    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }
);

server.tool(
  "vim_window",
  { 
    command: z.enum(["split", "vsplit", "only", "close", "wincmd h", "wincmd j", "wincmd k", "wincmd l"])
      .describe("Window manipulation command: split or vsplit to create new window, only to keep just current window, close to close current window, or wincmd with h/j/k/l to navigate between windows")
  },
  async ({ command }) => {
    const result = await neovimManager.manipulateWindow(command);
    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }
);

server.tool(
  "vim_mark",
  {
    mark: z.string().regex(/^[a-z]$/).describe("Single lowercase letter [a-z] to use as the mark name"),
    line: z.number().describe("The line number where the mark should be placed (1-indexed)"),
    column: z.number().describe("The column number where the mark should be placed (0-indexed)")
  },
  async ({ mark, line, column }) => {
    const result = await neovimManager.setMark(mark, line, column);
    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }
);

server.tool(
  "vim_register",
  {
    register: z.string().regex(/^[a-z\"]$/).describe("Register name - a lowercase letter [a-z] or double-quote [\"] for the unnamed register"),
    content: z.string().describe("The text content to store in the specified register")
  },
  async ({ register, content }) => {
    const result = await neovimManager.setRegister(register, content);
    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }
);

server.tool(
  "vim_visual",
  {
    startLine: z.number().describe("The starting line number for visual selection (1-indexed)"),
    startColumn: z.number().describe("The starting column number for visual selection (0-indexed)"),
    endLine: z.number().describe("The ending line number for visual selection (1-indexed)"),
    endColumn: z.number().describe("The ending column number for visual selection (0-indexed)")
  },
  async ({ startLine, startColumn, endLine, endColumn }) => {
    const result = await neovimManager.visualSelect(startLine, startColumn, endLine, endColumn);
    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }
);

// Register an empty prompts list since we don't support any prompts. Clients still ask.
server.prompt("empty", {}, () => ({
  messages: []
}));

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

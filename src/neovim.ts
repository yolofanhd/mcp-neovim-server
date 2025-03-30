import { attach, Neovim } from 'neovim';

interface NeovimStatus {
  cursorPosition: [number, number];
  mode: string;
  visualSelection: string;
  fileName: string;
  windowLayout: string;
  currentTab: number;
  marks: { [key: string]: [number, number] };
  registers: { [key: string]: string };
  cwd: string;
}

interface BufferInfo {
  number: number;
  name: string;
  isListed: boolean;
  isLoaded: boolean;
  modified: boolean;
  syntax: string;
  windowIds: number[];
}

interface WindowInfo {
  id: number;
  bufferId: number;
  width: number;
  height: number;
  row: number;
  col: number;
}

export class NeovimManager {
  private static instance: NeovimManager;

  private constructor() { }

  public static getInstance(): NeovimManager {
    if (!NeovimManager.instance) {
      NeovimManager.instance = new NeovimManager();
    }
    return NeovimManager.instance;
  }

  private async connect(): Promise<Neovim> {
    try {
      const socketPath = process.env.NVIM_SOCKET_PATH || '/tmp/nvim';
      return attach({
        socket: socketPath
      });
    } catch (error) {
      console.error('Error connecting to Neovim:', error);
      throw error;
    }
  }

  public async getBufferContents(): Promise<Map<number, string>> {
    try {
      const nvim = await this.connect();
      const buffer = await nvim.buffer;
      const lines = await buffer.lines;
      const lineMap = new Map<number, string>();

      lines.forEach((line: string, index: number) => {
        lineMap.set(index + 1, line);
      });

      return lineMap;
    } catch (error) {
      console.error('Error getting buffer contents:', error);
      return new Map();
    }
  }

  public async sendCommand(command: string): Promise<string> {
    try {
      const nvim = await this.connect();

      // Remove leading colon if present
      const normalizedCommand = command.startsWith(':') ? command.substring(1) : command;

      // Handle shell commands (starting with !)
      if (normalizedCommand.startsWith('!')) {
        if (process.env.ALLOW_SHELL_COMMANDS !== 'true') {
          return 'Shell command execution is disabled. Set ALLOW_SHELL_COMMANDS=true environment variable to enable shell commands.';
        }

        try {
          const shellCommand = normalizedCommand.substring(1).trim();
          // Execute the command and capture output directly
          const output = await nvim.eval(`system('${shellCommand.replace(/'/g, "''")}')`);
          if (output) {
            return String(output).trim();
          }
          return 'No output from command';
        } catch (error) {
          console.error('Shell command error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          return `Error executing shell command: ${errorMessage}`;
        }
      }

      // For regular Vim commands
      await nvim.setVvar('errmsg', '');
      
      // Execute the command and capture its output using the execute() function
      const output = await nvim.call('execute', [normalizedCommand]);
      
      // Check for errors
      const vimerr = await nvim.getVvar('errmsg');
      if (vimerr) {
        console.error('Vim error:', vimerr);
        return `Error executing command: ${vimerr}`;
      }

      // Return the actual command output if any
      return output ? String(output).trim() : 'Command executed (no output)';
    } catch (error) {
      console.error('Error sending command:', error);
      return 'Error executing command';
    }
  }

  public async getNeovimStatus(): Promise<NeovimStatus | string> {
    try {
      const nvim = await this.connect();
      const window = await nvim.window;
      const cursor = await window.cursor;
      const mode = await nvim.mode;
      const buffer = await nvim.buffer;
      
      // Get window layout
      const layout = await nvim.eval('winlayout()');
      const tabpage = await nvim.tabpage;
      const currentTab = await tabpage.number;

      // Get marks (a-z)
      const marks: { [key: string]: [number, number] } = {};
      for (const mark of 'abcdefghijklmnopqrstuvwxyz') {
        try {
          const pos = await nvim.eval(`getpos("'${mark}")`) as [number, number, number, number];
          marks[mark] = [pos[1], pos[2]];
        } catch (e) {
          // Mark not set
        }
      }

      // Get registers (a-z, ", 0-9)
      const registers: { [key: string]: string } = {};
      const registerNames = [...'abcdefghijklmnopqrstuvwxyz', '"', ...Array(10).keys()];
      for (const reg of registerNames) {
        try {
          registers[reg] = String(await nvim.eval(`getreg('${reg}')`));
        } catch (e) {
          // Register empty
        }
      }

      // Get current working directory
      const cwd = await nvim.call('getcwd');

      const neovimStatus: NeovimStatus = {
        cursorPosition: cursor,
        mode: mode.mode,
        visualSelection: '',
        fileName: await buffer.name,
        windowLayout: JSON.stringify(layout),
        currentTab,
        marks,
        registers,
        cwd
      };

      if (mode.mode.startsWith('v')) {
        const start = await nvim.eval(`getpos("'<")`) as [number, number, number, number];
        const end = await nvim.eval(`getpos("'>")`) as [number, number, number, number];
        const lines = await buffer.getLines({
          start: start[1] - 1,
          end: end[1],
          strictIndexing: true
        });
        neovimStatus.visualSelection = lines.join('\n');
      }

      return neovimStatus;
    } catch (error) {
      console.error('Error getting Neovim status:', error);
      return 'Error getting Neovim status';
    }
  }

  public async editLines(startLine: number, mode: 'replace' | 'insert' | 'replaceAll', newText: string): Promise<string> {
    try {
      const nvim = await this.connect();
      const splitByLines = newText.split('\n');
      const buffer = await nvim.buffer;

      if (mode === 'replaceAll') {
        // Handle full buffer replacement
        const lineCount = await buffer.length;
        // Delete all lines and then append new content
        await buffer.remove(0, lineCount, true);
        await buffer.insert(splitByLines, 0);
        return 'Buffer completely replaced';
      } else if (mode === 'replace') {
        await buffer.replace(splitByLines, startLine - 1);
        return 'Lines replaced successfully';
      } else if (mode === 'insert') {
        await buffer.insert(splitByLines, startLine - 1);
        return 'Lines inserted successfully';
      }

      return 'Invalid mode specified';
    } catch (error) {
      console.error('Error editing lines:', error);
      return 'Error editing lines';
    }
  }

  public async getWindows(): Promise<WindowInfo[]> {
    try {
      const nvim = await this.connect();
      const windows = await nvim.windows;
      const windowInfos: WindowInfo[] = [];

      for (const win of windows) {
        const buffer = await win.buffer;
        const [width, height] = await Promise.all([
          win.width,
          win.height
        ]);
        const position = await win.position;

        windowInfos.push({
          id: win.id,
          bufferId: buffer.id,
          width,
          height,
          row: position[0],
          col: position[1]
        });
      }

      return windowInfos;
    } catch (error) {
      console.error('Error getting windows:', error);
      return [];
    }
  }

  public async manipulateWindow(command: string): Promise<string> {
    const validCommands = ['split', 'vsplit', 'only', 'close', 'wincmd h', 'wincmd j', 'wincmd k', 'wincmd l'];
    if (!validCommands.some(cmd => command.startsWith(cmd))) {
      return 'Invalid window command';
    }

    try {
      const nvim = await this.connect();
      await nvim.command(command);
      return 'Window command executed';
    } catch (error) {
      console.error('Error manipulating window:', error);
      return 'Error executing window command';
    }
  }

  public async setMark(mark: string, line: number, col: number): Promise<string> {
    if (!/^[a-z]$/.test(mark)) {
      return 'Invalid mark name (must be a-z)';
    }

    try {
      const nvim = await this.connect();
      await nvim.command(`mark ${mark}`);
      const window = await nvim.window;
      await (window.cursor = [line, col]);
      return `Mark ${mark} set at line ${line}, column ${col}`;
    } catch (error) {
      console.error('Error setting mark:', error);
      return 'Error setting mark';
    }
  }

  public async setRegister(register: string, content: string): Promise<string> {
    const validRegisters = [...'abcdefghijklmnopqrstuvwxyz"'];
    if (!validRegisters.includes(register)) {
      return 'Invalid register name';
    }

    try {
      const nvim = await this.connect();
      await nvim.eval(`setreg('${register}', '${content.replace(/'/g, "''")}')`);
      return `Register ${register} set`;
    } catch (error) {
      console.error('Error setting register:', error);
      return 'Error setting register';
    }
  }

  public async visualSelect(startLine: number, startCol: number, endLine: number, endCol: number): Promise<string> {
    try {
      const nvim = await this.connect();
      const window = await nvim.window;
      
      // Enter visual mode
      await nvim.command('normal! v');
      
      // Move cursor to start position
      await (window.cursor = [startLine, startCol]);
      
      // Move cursor to end position (selection will be made)
      await (window.cursor = [endLine, endCol]);
      
      return 'Visual selection made';
    } catch (error) {
      console.error('Error making visual selection:', error);
      return 'Error making visual selection';
    }
  }

  public async getOpenBuffers(): Promise<BufferInfo[]> {
    try {
      const nvim = await this.connect();
      const buffers = await nvim.buffers;
      const windows = await nvim.windows;
      const bufferInfos: BufferInfo[] = [];

      for (const buffer of buffers) {
        const [
          isLoaded,
          isListedOption,
          modified,
          syntax
        ] = await Promise.all([
          buffer.loaded,
          buffer.getOption('buflisted'),
          buffer.getOption('modified'),
          buffer.getOption('syntax')
        ]);
        const isListed = Boolean(isListedOption);

        // Find windows containing this buffer
        const windowIds = [];
        for (const win of windows) {
          const winBuffer = await win.buffer;
          if (winBuffer.id === buffer.id) {
            windowIds.push(win.id);
          }
        }

        bufferInfos.push({
          number: buffer.id,
          name: await buffer.name,
          isListed,
          isLoaded,
          modified: Boolean(modified),
          syntax: String(syntax),
          windowIds
        });
      }

      return bufferInfos;
    } catch (error) {
      console.error('Error getting open buffers:', error);
      return [];
    }
  }
}

import { attach, Neovim } from 'neovim';

interface NeovimStatus {
  cursorPosition: [number, number];
  mode: string;
  visualSelection: string;
  fileName: string;
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
      return attach({
        socket: '/tmp/nvim'
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
      await nvim.setVvar('errmsg', '');
      await nvim.feedKeys(
        await nvim.replaceTermcodes(command + '<cr>', true, true, true),
        'n',
        false
      );

      const vimerr = await nvim.getVvar('errmsg');
      if (vimerr) {
        console.error('Vim error:', vimerr);
        return `Error executing command: ${vimerr}`;
      }

      return 'Command executed';
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

      const neovimStatus: NeovimStatus = {
        cursorPosition: cursor,
        mode: mode.mode,
        visualSelection: '',
        fileName: await buffer.name
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

  public async editLines(startLine: number, mode: 'replace' | 'insert', newText: string): Promise<string> {
    try {
      const nvim = await this.connect();
      const splitByLines = newText.split('\n');
      const buffer = await nvim.buffer;

      if (mode === 'replace') {
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
}
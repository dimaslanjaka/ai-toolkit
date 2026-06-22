/**
 * RTK Token Saver Integration
 * Compresses LLM tool output using RTK (Rust Token Killer) to save 20-40% tokens
 * RTK binary: https://github.com/rtk-ai/rtk
 */

import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'upath';
import { getSettings } from '../database/shared.js';

// RTK binary location candidates
const RTK_CANDIDATES = [
  path.join(process.cwd(), 'node_modules', '.bin', 'rtk.exe'),
  path.join(process.cwd(), 'node_modules', '.bin', 'rtk')
];

export class RtkTokenSaver {
  private rtkPath: string | null = null;
  private checked = false;
  private enabled: boolean = false;
  private dbInitialized = false;

  constructor() {
    // RTK_ENABLED will be loaded from database on first use
  }

  private async loadFromDatabase(): Promise<void> {
    if (this.dbInitialized) return;
    this.dbInitialized = true;

    try {
      const settings = await getSettings();
      if (settings) {
        const value = await settings.getSetting('RTK_ENABLED');
        if (value !== null && value !== undefined) {
          this.enabled = value === 'true';
        } else {
          this.enabled = false;
        }
      }
    } catch (error) {
      console.warn('Failed to load RTK_ENABLED from database:', error);
      this.enabled = false;
    }
  }

  private findRtk(): string | null {
    if (this.checked) return this.rtkPath;
    this.checked = true;

    for (const candidate of RTK_CANDIDATES) {
      if (fs.existsSync(candidate)) {
        this.rtkPath = candidate;
        return candidate;
      }
    }
    return null;
  }

  async isAvailable(): Promise<boolean> {
    await this.loadFromDatabase();
    if (!this.enabled) return false;
    return this.findRtk() !== null;
  }

  /**
   * Compress tool output using RTK filter
   * @param output - Raw tool output
   * @param commandHint - Optional hint about what command produced this output (e.g., "git diff", "grep")
   * @returns Compressed output or original if RTK unavailable/fails
   */
  async compressToolOutput(output: string, commandHint?: string): Promise<string> {
    if (!(await this.isAvailable())) return output;
    if (!output || output.length < 100) return output; // Don't compress tiny outputs

    try {
      const result = spawnSync(this.rtkPath!, ['filter', commandHint || 'auto'], {
        input: output,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (result.status === 0 && result.stdout && result.stdout.length > 0) {
        const compressed = result.stdout;
        // Only use compressed version if it's actually smaller (or close)
        if (compressed.length <= output.length * 1.1) {
          return compressed;
        }
      }
      return output; // Fallback to original
    } catch {
      return output; // Never break the request
    }
  }

  /**
   * Estimate tokens (approx 4 chars per token)
   */
  estimateTokens(text: string): number {
    return Math.max(0, Math.ceil(text.length / 4));
  }
}

// Singleton instance
let instance: RtkTokenSaver | null = null;

export function getRtkTokenSaver(): RtkTokenSaver {
  if (!instance) {
    instance = new RtkTokenSaver();
  }
  return instance;
}

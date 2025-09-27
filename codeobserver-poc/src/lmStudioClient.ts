import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export interface LmStudioClientOptions {
  cliPath: string;
  model: string;
  systemPrompt?: string;
  host?: string;
  port?: number;
  ttlSeconds?: number;
  timeoutMs?: number;
  preloadModel?: boolean;
  offline?: boolean;
  outputChannel?: vscode.OutputChannel;
}

export interface ChatOptions {
  systemPrompt?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

export class LmStudioClient {
  private readonly cliPath: string;
  private readonly model: string;
  private readonly defaultSystemPrompt?: string;
  private readonly host?: string;
  private readonly port?: number;
  private readonly ttlSeconds?: number;
  private readonly timeoutMs: number;
  private readonly preloadModel: boolean;
  private readonly offline: boolean;
  private readonly outputChannel?: vscode.OutputChannel;
  private loadPromise?: Promise<void>;

  constructor(options: LmStudioClientOptions) {
    this.cliPath = options.cliPath;
    this.model = options.model;
    this.defaultSystemPrompt = options.systemPrompt;
    this.host = options.host;
    this.port = options.port;
    this.ttlSeconds = options.ttlSeconds;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.preloadModel = options.preloadModel ?? true;
    this.offline = options.offline ?? true;
    this.outputChannel = options.outputChannel;
  }

  public async chat(prompt: string, overrides: ChatOptions = {}): Promise<string> {
    if (!prompt.trim()) {
      throw new Error('LM Studio prompt must not be empty.');
    }

    if (this.preloadModel) {
      await this.ensureModelLoaded(overrides);
    }

    const args = this.buildCommonArgs('chat');
    args.push(this.model);
    args.push('--prompt', prompt);
    args.push('--yes');

    const systemPrompt = overrides.systemPrompt ?? this.defaultSystemPrompt;
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    if (this.offline) {
      args.push('--offline');
    }

    const timeout = overrides.timeoutMs ?? this.timeoutMs;
    const result = await this.runCli(args, {
      timeout,
      signal: overrides.signal,
    });

    const trimmed = result.stdout.trim();
    if (!trimmed) {
      throw new Error('LM Studio returned an empty response.');
    }
    return trimmed;
  }

  public async ensureModelLoaded(overrides: { signal?: AbortSignal } = {}): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }

    this.loadPromise = this.loadModel(overrides);
    await this.loadPromise;
  }

  private async loadModel(overrides: { signal?: AbortSignal }): Promise<void> {
    const args = this.buildCommonArgs('load');
    args.push(this.model);
    args.push('--yes');
    if (this.ttlSeconds) {
      args.push('--ttl', String(this.ttlSeconds));
    }

    await this.runCli(args, { timeout: this.timeoutMs, signal: overrides.signal });
    this.logToOutput(`Loaded LM Studio model "${this.model}".`);
  }

  private buildCommonArgs(subcommand: string): string[] {
    const args = [subcommand];
    if (this.host) {
      args.push('--host', this.host);
    }
    if (this.port) {
      args.push('--port', String(this.port));
    }
    return args;
  }

  private async runCli(args: string[], options: { timeout?: number; signal?: AbortSignal }): Promise<ExecResult> {
    this.logToOutput(`Executing: ${this.cliPath} ${args.join(' ')}`);

    try {
      const { stdout, stderr } = await execFileAsync(this.cliPath, args, {
        timeout: options.timeout,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        signal: options.signal,
      });

      if (stderr.trim()) {
        this.logToOutput(`LM Studio stderr: ${stderr.trim()}`);
      }

      return { stdout, stderr };
    } catch (error) {
      const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      const stdout = execError.stdout?.toString() ?? '';
      const stderr = execError.stderr?.toString() ?? '';
      const details = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || execError.message;
      throw new Error(`LM Studio CLI command failed: ${details}`);
    }
  }

  private logToOutput(message: string): void {
    if (!this.outputChannel) {
      return;
    }

    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }
}

import type { LmStudioClient } from './lmStudioClient';
import { buildActivityStats } from './activityStats';
import { AnalysisContext } from './analysisTypes';
import { HeuristicAnalyzer } from './analyzers/heuristicAnalyzer';
import { LmStudioAnalyzer } from './analyzers/lmStudioAnalyzer';
import { StrategicInsight } from './types';

type LmStudioAdapter = Pick<LmStudioClient, 'chat'>;

export type { AnalysisContext } from './analysisTypes';

export interface AnalysisEngineOptions {
  objectives: string[];
  systemPrompt?: string;
  logger?: (message: string) => void;
  maxEventsInPrompt?: number;
  fallbackConfidenceBase?: number;
  lmStudioClient?: LmStudioAdapter;
}

export class AnalysisEngine {
  private objectives: string[];
  private readonly fallbackAnalyzer: HeuristicAnalyzer;
  private lmStudioAnalyzer: LmStudioAnalyzer | null;
  private systemPrompt?: string;
  private logger?: (message: string) => void;
  private readonly maxEventsInPrompt: number;
  private readonly fallbackConfidenceBase: number;
  private lmStudioHealthy: boolean;

  constructor(options: AnalysisEngineOptions) {
    this.objectives = options.objectives;
  this.systemPrompt = options.systemPrompt?.trim() || undefined;
    this.logger = options.logger;
    this.maxEventsInPrompt = options.maxEventsInPrompt ?? 12;
    this.fallbackConfidenceBase = options.fallbackConfidenceBase ?? 0.55;
    this.fallbackAnalyzer = new HeuristicAnalyzer({
      objectives: this.objectives,
      fallbackConfidenceBase: this.fallbackConfidenceBase,
    });
    this.lmStudioAnalyzer = null;
    this.lmStudioHealthy = false;

    if (options.lmStudioClient) {
      this.attachLmStudioClient(options.lmStudioClient);
    }
  }

  public updateObjectives(objectives: string[]): void {
    this.objectives = objectives;
    this.fallbackAnalyzer.updateObjectives(objectives);
  }

  public updateLmStudioClient(client?: LmStudioAdapter): void {
    if (client) {
      this.attachLmStudioClient(client);
      return;
    }

    this.lmStudioAnalyzer = null;
    this.lmStudioHealthy = false;
  }

  public updateSystemPrompt(prompt?: string): void {
    const nextPrompt = prompt?.trim() || undefined;
    this.systemPrompt = nextPrompt;
    if (this.lmStudioAnalyzer) {
      this.lmStudioAnalyzer.updateSystemPrompt(nextPrompt);
    }
  }

  public updateLogger(logger?: (message: string) => void): void {
    this.logger = logger;
  }

  public async run(context: AnalysisContext): Promise<StrategicInsight> {
    const stats = buildActivityStats(context, this.maxEventsInPrompt);

    if (this.lmStudioAnalyzer && this.lmStudioHealthy) {
      try {
        const insight = await this.lmStudioAnalyzer.analyze(context, stats);
        return insight;
      } catch (error) {
        this.lmStudioHealthy = false;
        this.logger?.(
          `LM Studio analysis failed (${context.reason}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return this.fallbackAnalyzer.analyze(context, stats, {
          source: 'lmstudio-fallback',
          error,
        });
      }
    }

    const source = this.lmStudioAnalyzer ? 'lmstudio-fallback' : 'local-fallback';
    return this.fallbackAnalyzer.analyze(context, stats, { source });
  }

  private attachLmStudioClient(client: LmStudioAdapter): void {
    this.lmStudioAnalyzer = new LmStudioAnalyzer({
      client,
      systemPrompt: this.systemPrompt,
    });
    this.lmStudioHealthy = true;
  }
}

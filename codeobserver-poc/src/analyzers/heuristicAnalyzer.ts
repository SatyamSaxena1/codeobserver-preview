import { AnalysisContext, ActivityStats } from '../analysisTypes';
import { StrategicInsight } from '../types';

const RANDOM_INSIGHT_POOL = [
  'Review the boundaries between core modules to prevent accidental coupling.',
  'Capture lessons learned in documentation before the context is lost.',
  'Align the latest refactors with your stated architectural patterns.',
  'Validate that new code paths include adequate telemetry for observability.',
  'Check error handling branches to match reliability objectives.',
];

export interface HeuristicAnalyzerOptions {
  objectives: string[];
  fallbackConfidenceBase: number;
}

export interface HeuristicAnalysisMetadata {
  source: 'lmstudio-fallback' | 'local-fallback';
  error?: unknown;
}

export class HeuristicAnalyzer {
  private objectives: string[];
  private fallbackConfidenceBase: number;

  constructor(options: HeuristicAnalyzerOptions) {
    this.objectives = options.objectives;
    this.fallbackConfidenceBase = options.fallbackConfidenceBase;
  }

  public updateObjectives(objectives: string[]): void {
    this.objectives = objectives;
  }

  public analyze(
    context: AnalysisContext,
    stats: ActivityStats,
    metadata: HeuristicAnalysisMetadata,
  ): StrategicInsight {
    const dominantObjective = this.pickObjective(stats.files.length, stats.languages.length);
    const summary = this.buildSummary(dominantObjective, {
      files: stats.files.length,
      languages: stats.languages.length,
      saves: stats.saveCount,
      changes: stats.changeCount,
    });
    const actions = this.deriveActions(stats.changeCount, stats.saveCount, dominantObjective);
    const confidence = this.estimateConfidence(stats.changeCount, stats.saveCount);

    const insightMetadata: Record<string, unknown> = {
      source: metadata.source,
      files: stats.files,
      languages: stats.languages,
      eventCount: stats.eventCount,
      reason: context.reason,
    };

    if (metadata.error) {
      insightMetadata.errorMessage = metadata.error instanceof Error
        ? metadata.error.message
        : String(metadata.error);
    }

    return {
      id: `insight-${Date.now().toString(36)}`,
      summary,
      confidence,
      actions,
      timestamp: Date.now(),
      metadata: insightMetadata,
    };
  }

  private pickObjective(fileTouchCount: number, languageCount: number): string {
    if (this.objectives.length === 0) {
      return 'Maintain overarching project goals';
    }

    const index = Math.abs(fileTouchCount + languageCount + Date.now()) % this.objectives.length;
    return this.objectives[index];
  }

  private buildSummary(
    objective: string,
    metrics: { files: number; languages: number; saves: number; changes: number },
  ): string {
    const insightBase = RANDOM_INSIGHT_POOL[Math.floor(Math.random() * RANDOM_INSIGHT_POOL.length)];
    const filePart = metrics.files > 1 ? `${metrics.files} files touched` : 'single file focus';
    const languagePart = metrics.languages > 1 ? `${metrics.languages} languages` : 'one language';
    const changeDensity = metrics.changes > 4 ? 'high iteration tempo' : 'steady iteration pace';
    const saveRhythm = metrics.saves > 2 ? 'frequent checkpoints' : 'infrequent saves';

    return `${insightBase} Currently observing ${filePart} across ${languagePart} with a ${changeDensity} and ${saveRhythm}. Stay aligned with "${objective}".`;
  }

  private deriveActions(changeCount: number, saveCount: number, objective: string): string[] {
    const actions: string[] = [];
    if (changeCount > 6) {
      actions.push('Schedule a focused review session for the most active files.');
    }
    if (saveCount === 0) {
      actions.push('Persist work-in-progress to create recovery points.');
    }
    if (!actions.length) {
      actions.push(`Evaluate whether current changes reinforce the objective: ${objective}.`);
    }

    return actions;
  }

  private estimateConfidence(changeCount: number, saveCount: number): number {
    const modifier = Math.min(0.35, (changeCount + saveCount) * 0.03);
    return Math.min(0.9, Number((this.fallbackConfidenceBase + modifier).toFixed(2)));
  }
}

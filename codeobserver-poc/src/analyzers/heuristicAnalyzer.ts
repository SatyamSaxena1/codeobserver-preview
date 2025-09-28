import { AnalysisContext, ActivityStats } from '../analysisTypes';
import { StrategicInsight } from '../types';

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
    const summary = this.buildSummary(dominantObjective, stats, context.reason);
    const actions = this.deriveActions(stats, dominantObjective);
    const confidence = this.estimateConfidence(stats.changeCount, stats.saveCount);

    const insightMetadata: Record<string, unknown> = {
      source: metadata.source,
      files: stats.files,
      languages: stats.languages,
      eventCount: stats.eventCount,
      reason: context.reason,
  changeCount: stats.changeCount,
  saveCount: stats.saveCount,
  objective: dominantObjective,
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

  private buildSummary(objective: string, stats: ActivityStats, reason: AnalysisContext['reason']): string {
    const reasonClause = this.describeReason(reason);
    const fileClause = this.describeFiles(stats.files);
    const languageClause = this.describeLanguages(stats.languages);
    const cadenceClause = this.describeCadence(stats.changeCount, stats.saveCount);
    const objectiveClause = this.describeObjective(objective);

    return [reasonClause, fileClause, languageClause, cadenceClause, objectiveClause]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ') // collapse incidental multi-spaces
      .trim();
  }

  private deriveActions(stats: ActivityStats, objective: string): string[] {
    const actions: string[] = [];
    const focusFiles = this.selectRepresentativeFiles(stats.files);

    if (focusFiles.length) {
      actions.push(
        `Walk through ${this.humaniseList(focusFiles)} and capture follow-ups that keep "${objective}" on track.`,
      );
    }

    if (stats.languages.length > 1) {
      actions.push('Sync interface changes across languages to prevent drift.');
    }

    if (stats.changeCount > 8 && stats.saveCount < 2) {
      actions.push('Checkpoint the current work to create a safe rollback point.');
    }

    if (!actions.length) {
      actions.push(`Evaluate whether the latest edits reinforce "${objective}" and note gaps.`);
    }

    return actions;
  }

  private estimateConfidence(changeCount: number, saveCount: number): number {
    const modifier = Math.min(0.35, (changeCount + saveCount) * 0.03);
    return Math.min(0.9, Number((this.fallbackConfidenceBase + modifier).toFixed(2)));
  }

  private describeReason(reason: AnalysisContext['reason']): string {
    switch (reason) {
      case 'manual':
        return 'You requested a strategic check-in.';
      case 'autosave':
        return 'Autosave activity triggered a strategic pulse.';
      default:
        return 'Recent activity triggered a strategic pulse.';
    }
  }

  private describeFiles(uris: string[]): string {
    const names = this.collectFileNames(uris);
    if (!names.length) {
      return 'No workspace files have been modified yet.';
    }

    if (names.length === 1) {
      return `Current focus is on ${names[0]}.`;
    }

    if (names.length === 2) {
      return `Current focus spans ${names[0]} and ${names[1]}.`;
    }

    const highlighted = names.slice(0, 3);
    const remainder = names.length - highlighted.length;
    const suffix = remainder > 0 ? ` (+${remainder} more)` : '';
    return `Hotspots include ${this.humaniseList(highlighted)}${suffix}.`;
  }

  private describeLanguages(languages: string[]): string {
    const unique = Array.from(new Set(languages));
    if (!unique.length) {
      return '';
    }
    if (unique.length === 1) {
      return `Changes are contained within ${unique[0]}.`;
    }
    const highlighted = unique.slice(0, 3);
    const remainder = unique.length - highlighted.length;
    const suffix = remainder > 0 ? ` (+${remainder} more)` : '';
    return `Edits span ${unique.length} languages (${this.humaniseList(highlighted)}${suffix}).`;
  }

  private describeCadence(changeCount: number, saveCount: number): string {
    const changeDescriptor = changeCount > 10
      ? 'a very rapid iteration pace'
      : changeCount > 4
        ? 'a brisk iteration pace'
        : 'a measured iteration pace';
    const saveDescriptor = saveCount === 0
      ? 'no checkpoints captured yet'
      : saveCount > 3
        ? 'regular checkpoints captured'
        : 'few checkpoints captured';

    return `You are moving with ${changeDescriptor} and ${saveDescriptor}.`;
  }

  private describeObjective(objective: string): string {
    const trimmed = objective.trim();
    if (!trimmed) {
      return 'Revisit your top objectives to ensure the work supports them.';
    }

    const emphasised = trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
    return `Use this window to verify progress toward "${emphasised}".`;
  }

  private selectRepresentativeFiles(uris: string[]): string[] {
    const names = this.collectFileNames(uris);
    return names.slice(0, 3);
  }

  private collectFileNames(uris: string[]): string[] {
    const names = new Set<string>();
    for (const uri of uris) {
      const name = this.extractFileName(uri);
      if (name) {
        names.add(name);
      }
    }
    return Array.from(names);
  }

  private extractFileName(uri: string): string | undefined {
    if (!uri.startsWith('file://')) {
      return undefined;
    }

    const withoutScheme = uri.replace(/^file:\/\//, '');
    const strippedQuery = withoutScheme.split('?')[0];
    const segments = strippedQuery.split(/[\\/]/);
    const candidate = segments.pop();
    if (!candidate) {
      return undefined;
    }

    try {
      return decodeURIComponent(candidate);
    } catch (error) {
      void error; // ignore decode errors and return raw segment
      return candidate;
    }
  }

  private humaniseList(items: string[]): string {
    if (items.length === 0) {
      return '';
    }
    if (items.length === 1) {
      return items[0];
    }
    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }
    const head = items.slice(0, -1).join(', ');
    const tail = items[items.length - 1];
    return `${head}, and ${tail}`;
  }
}

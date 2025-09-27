import type { ChatOptions, LmStudioClient } from '../lmStudioClient';
import { AnalysisContext, ActivityStats } from '../analysisTypes';
import { StrategicInsight } from '../types';

const DEFAULT_SYSTEM_PROMPT = `You are CodeObserver, an architectural oversight assistant.
Provide concise strategic insights that help software teams evaluate recent code activity.
Prioritize architectural alignment, design clarity, and risk mitigation.`;

interface HarmonyPayload {
  summary: string;
  confidence: number;
  actions: string[];
  reasoning?: string;
}

export interface LmStudioAnalyzerOptions {
  client: Pick<LmStudioClient, 'chat'>;
  systemPrompt?: string;
}

export class LmStudioAnalyzer {
  private readonly client: Pick<LmStudioClient, 'chat'>;
  private systemPrompt: string;

  constructor(options: LmStudioAnalyzerOptions) {
    this.client = options.client;
    this.systemPrompt = options.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  }

  public updateSystemPrompt(prompt?: string): void {
    this.systemPrompt = prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  }

  public async analyze(context: AnalysisContext, stats: ActivityStats): Promise<StrategicInsight> {
    const prompt = this.buildHarmonyPrompt(context, stats);
    const response = await this.client.chat(prompt, {
      systemPrompt: this.systemPrompt,
    } satisfies ChatOptions);
    const parsed = this.parseHarmonyResponse(response);

    return {
      id: `insight-${Date.now().toString(36)}`,
      summary: parsed.summary,
      confidence: parsed.confidence,
      actions: parsed.actions.length
        ? parsed.actions
        : this.fallbackActions(stats.changeCount, stats.saveCount, context.objectives),
      timestamp: Date.now(),
      metadata: {
        source: 'lmstudio',
        files: stats.files,
        languages: stats.languages,
        eventCount: stats.eventCount,
        reason: context.reason,
        rawResponse: response,
        reasoning: parsed.reasoning,
      },
    };
  }

  private buildHarmonyPrompt(context: AnalysisContext, stats: ActivityStats): string {
    const objectiveLines = context.objectives.length
      ? context.objectives.map((objective, index) => `${index + 1}. ${objective}`)
      : ['No explicit objectives provided.'];

    const activityLines = stats.recentEvents.length
      ? stats.recentEvents
      : ['No recent activity recorded.'];

    const metricsBlock = [
      `Files touched: ${stats.files.length}`,
      `Languages observed: ${stats.languages.length}`,
      `Document changes: ${stats.changeCount}`,
      `Document saves: ${stats.saveCount}`,
      `Total events: ${stats.eventCount}`,
      `Analysis reason: ${context.reason}`,
    ].join('\n');

    const responseInstructions =
      'Respond with a single JSON object matching: {"summary": string, "confidence": number between 0 and 1, "actions": string[] (maximum 4 concise strategic recommendations), "reasoning": string (optional)}.';

    return [
      '<|system|>',
      this.systemPrompt,
      '<|user|>',
      'Project objectives:',
      objectiveLines.join('\n'),
      '\nRecent activity (most recent first):',
      activityLines.join('\n'),
      '\nMetrics:',
      metricsBlock,
      '\nGuidelines:',
      responseInstructions,
      '<|assistant|>',
    ].join('\n');
  }

  private parseHarmonyResponse(raw: string): HarmonyPayload {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LM Studio response is missing the expected JSON payload.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw new Error(
        `LM Studio response contained invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('LM Studio response JSON must be an object.');
    }

    const payload = parsed as Partial<HarmonyPayload>;

    if (!payload.summary || typeof payload.summary !== 'string') {
      throw new Error('LM Studio response must include a textual "summary" field.');
    }

    const actions = Array.isArray(payload.actions)
      ? payload.actions
          .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
          .filter((item) => item.length > 0)
          .slice(0, 4)
      : [];

    const confidence = this.normalizeConfidence(payload.confidence);

    return {
      summary: payload.summary.trim(),
      confidence,
      actions,
      reasoning: payload.reasoning?.trim(),
    };
  }

  private fallbackActions(changeCount: number, saveCount: number, objectives: string[]): string[] {
    const objective = objectives[0] ?? 'Maintain overarching project goals';
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

  private normalizeConfidence(value: unknown): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const clamped = Math.min(0.99, Math.max(0.05, numeric));
      return Number(clamped.toFixed(2));
    }
    return 0.7;
  }

}

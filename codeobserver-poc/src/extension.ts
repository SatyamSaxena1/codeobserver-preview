import * as vscode from 'vscode';
import { ActivityMonitor } from './activityMonitor';
import { AnalysisEngine } from './analysisEngine';
import { LmStudioClient } from './lmStudioClient';
import { InsightStore } from './insightStore';
import { ActivityEvent, StrategicInsight } from './types';

const STATUS_IDLE = 'CodeObserver $(pulse)';
const DEFAULT_OBJECTIVES = [
  'Maintain architectural consistency',
  'Protect critical modules',
  'Keep codebase aligned with objectives',
];
const DEFAULT_ANALYSIS_COOLDOWN = 90;

interface LmStudioSettingsSnapshot {
  enabled: boolean;
  cliPath?: string;
  model?: string;
  timeoutMs?: number;
  ttlSeconds?: number;
  preloadModel: boolean;
  host?: string;
  port?: number;
  offline: boolean;
}

const areLmStudioSettingsEqual = (
  next?: LmStudioSettingsSnapshot,
  previous?: LmStudioSettingsSnapshot,
): boolean => {
  if (!next || !previous) {
    return false;
  }

  return (
    next.enabled === previous.enabled &&
    next.cliPath === previous.cliPath &&
    next.model === previous.model &&
    next.timeoutMs === previous.timeoutMs &&
    next.ttlSeconds === previous.ttlSeconds &&
    next.preloadModel === previous.preloadModel &&
    next.host === previous.host &&
    next.port === previous.port &&
    next.offline === previous.offline
  );
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('CodeObserver');
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  statusBarItem.text = STATUS_IDLE;
  statusBarItem.tooltip = 'CodeObserver POC is monitoring your workspace.';
  statusBarItem.command = 'codeObserver.showInsights';
  statusBarItem.show();
  output.appendLine('CodeObserver POC activated. Monitoring workspace events.');

  context.subscriptions.push(output, statusBarItem);

  let objectives: string[] = DEFAULT_OBJECTIVES;
  let analysisCooldown = DEFAULT_ANALYSIS_COOLDOWN;
  let lmStudioClient: LmStudioClient | undefined;
  let lmStudioActive = false;
  let lastLmStudioSettings: LmStudioSettingsSnapshot | undefined;
  let verboseLogging = false;

  const analysisEngine = new AnalysisEngine({
    objectives,
    logger: (message) => output.appendLine(`[Analysis] ${message}`),
  });
  const insightStore = new InsightStore();
  const monitoredActivity: ActivityEvent[] = [];
  let lastAnalysisTimestamp = 0;

  const refreshConfiguration = () => {
    const updatedConfiguration = vscode.workspace.getConfiguration('codeObserver');
    objectives = updatedConfiguration.get<string[]>('objectives', DEFAULT_OBJECTIVES);
    analysisCooldown = updatedConfiguration.get<number>(
      'analysisCooldown',
      DEFAULT_ANALYSIS_COOLDOWN,
    );
    analysisEngine.updateObjectives(objectives);
    verboseLogging = updatedConfiguration.get<boolean>('verboseLogging', false);

    const systemPrompt = updatedConfiguration.get<string>('lmStudio.systemPrompt');
    analysisEngine.updateSystemPrompt(systemPrompt);

    const enabled = updatedConfiguration.get<boolean>('lmStudio.enabled', false);
    const cliPath = updatedConfiguration.get<string>('lmStudio.cliPath')?.trim();
    const model = updatedConfiguration.get<string>('lmStudio.model')?.trim();
    const timeoutRaw = updatedConfiguration.get<number>('lmStudio.timeoutMs');
    const ttlRaw = updatedConfiguration.get<number>('lmStudio.ttlSeconds');
    const preloadModel = updatedConfiguration.get<boolean>('lmStudio.preloadModel', true);
    const host = updatedConfiguration.get<string>('lmStudio.host')?.trim() || undefined;
    const portRaw = updatedConfiguration.get<number>('lmStudio.port');
    const offline = updatedConfiguration.get<boolean>('lmStudio.offline', true);

    const timeoutMs = typeof timeoutRaw === 'number' && timeoutRaw > 0 ? timeoutRaw : undefined;
    const ttlSeconds = typeof ttlRaw === 'number' && ttlRaw > 0 ? ttlRaw : undefined;
    const port = typeof portRaw === 'number' && portRaw > 0 ? portRaw : undefined;

    const lmSettings: LmStudioSettingsSnapshot = {
      enabled,
      cliPath: cliPath || undefined,
      model: model || undefined,
      timeoutMs,
      ttlSeconds,
      preloadModel,
      host,
      port,
      offline,
    };

    if (areLmStudioSettingsEqual(lmSettings, lastLmStudioSettings)) {
      if (lmStudioActive) {
        output.appendLine('LM Studio configuration unchanged; keeping existing session.');
      }
      return;
    }

    lastLmStudioSettings = lmSettings;

    const shouldEnable = Boolean(lmSettings.enabled && lmSettings.cliPath && lmSettings.model);

    if (shouldEnable) {
      const resolvedCliPath = lmSettings.cliPath!;
      const resolvedModel = lmSettings.model!;
      lmStudioClient = new LmStudioClient({
        cliPath: resolvedCliPath,
        model: resolvedModel,
        systemPrompt,
        timeoutMs: lmSettings.timeoutMs,
        ttlSeconds: lmSettings.ttlSeconds,
        preloadModel: lmSettings.preloadModel,
        host: lmSettings.host,
        port: lmSettings.port,
        offline: lmSettings.offline,
        outputChannel: output,
      });
      analysisEngine.updateLmStudioClient(lmStudioClient);
      if (!lmStudioActive) {
        output.appendLine('LM Studio integration enabled.');
      }
      if (lmSettings.preloadModel) {
        lmStudioClient
          .ensureModelLoaded()
          .then(() => output.appendLine(`LM Studio model "${resolvedModel}" warmed and ready.`))
          .catch((error: unknown) =>
            output.appendLine(
              `LM Studio preload failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
      lmStudioActive = true;
    } else {
      analysisEngine.updateLmStudioClient(undefined);
      lmStudioClient = undefined;
      if (lmStudioActive) {
        output.appendLine('LM Studio integration disabled.');
      }
      lmStudioActive = false;
      if (lmSettings.enabled && (!lmSettings.cliPath || !lmSettings.model)) {
        output.appendLine('LM Studio integration requires both cliPath and model settings.');
      }
    }
  };

  refreshConfiguration();

  const updateStatusWithInsight = (summary: string, confidence: number) => {
    statusBarItem.text = `CodeObserver $(lightbulb) ${Math.round(confidence * 100)}%`;
    statusBarItem.tooltip = summary;
  };

  const triggerAnalysis = async (reason: string) => {
    const now = Date.now();
    if (reason !== 'manual' && now - lastAnalysisTimestamp < analysisCooldown * 1000) {
      output.appendLine(`Skipped analysis (${reason}); cooldown in effect.`);
      return;
    }

    if (monitoredActivity.length === 0) {
      output.appendLine(`No activity captured; analysis skipped (${reason}).`);
      return;
    }

    statusBarItem.text = 'CodeObserver $(sync~spin) analyzing…';
    statusBarItem.tooltip = 'Generating strategic insight from recent activity…';

    try {
      const insight = await analysisEngine.run({
        events: [...monitoredActivity],
        objectives,
        reason,
      });

      insightStore.setLatest(insight);
      updateStatusWithInsight(insight.summary, insight.confidence);
      output.appendLine(`[${new Date(insight.timestamp).toISOString()}] ${insight.summary}`);
      const source = (insight.metadata?.source as string) ?? 'unknown';
      output.appendLine(`Insight source: ${source}`);
      if (typeof insight.metadata?.errorMessage === 'string') {
        output.appendLine(`Fallback reason: ${insight.metadata?.errorMessage}`);
      }
      if (insight.actions.length) {
        output.appendLine('Recommended actions:');
        insight.actions.forEach((action) => output.appendLine(` • ${action}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`Analysis failed: ${message}`);
      statusBarItem.text = 'CodeObserver $(error)';
      statusBarItem.tooltip = message;
    } finally {
      monitoredActivity.length = 0;
      lastAnalysisTimestamp = Date.now();
    }
  };

  const activityMonitor = new ActivityMonitor((activity) => {
    monitoredActivity.push(activity);
    if (monitoredActivity.length > 100) {
      monitoredActivity.shift();
    }
    if (verboseLogging) {
      output.appendLine(
        `${activity.kind} @ ${activity.languageId ?? 'unknown language'} (${activity.uri})`,
      );
    }

    if (activity.kind === 'documentSave') {
      void triggerAnalysis('autosave');
    }
  });

  activityMonitor.start();
  context.subscriptions.push(activityMonitor);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
      if (event.affectsConfiguration('codeObserver')) {
        refreshConfiguration();
        output.appendLine('CodeObserver configuration updated.');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeObserver.showInsights', async () => {
      const latest = insightStore.getLatest();
      if (!latest) {
        await vscode.window.showInformationMessage('CodeObserver has no insights yet.');
        return;
      }

      const confidence = Math.round(latest.confidence * 100);
      const actionSummary = latest.actions.length
        ? `\n\nRecommended actions:\n${latest.actions.map((item) => `• ${item}`).join('\n')}`
        : '';

      await vscode.window.showInformationMessage(
        `${latest.summary}\nConfidence: ${confidence}%${actionSummary}`,
      );
    }),
    vscode.commands.registerCommand('codeObserver.analyzeWorkspace', async () => {
      monitoredActivity.push({
        kind: 'analysisRequest',
        uri: 'codeobserver://manual',
        details: { reason: 'manual', requestedAt: Date.now() },
        timestamp: Date.now(),
      });
      if (monitoredActivity.length > 100) {
        monitoredActivity.shift();
      }
      await triggerAnalysis('manual');
      const insight = insightStore.getLatest();
      if (!insight) {
        await vscode.window.showInformationMessage('CodeObserver could not generate insight.');
        return;
      }

      await vscode.window.showInformationMessage(`Generated insight: ${insight.summary}`);
    }),
    vscode.commands.registerCommand('codeObserver.showInsightHistory', async () => {
      const history = insightStore.getHistory();
      if (!history.length) {
        await vscode.window.showInformationMessage('CodeObserver has not produced any insights yet.');
        return;
      }

      const picks = history.map<vscode.QuickPickItem & { insight: StrategicInsight }>((item) => ({
        label: item.summary,
        description: `${new Date(item.timestamp).toLocaleTimeString()} • ${Math.round(
          item.confidence * 100,
        )}% confidence`,
        detail: item.actions.length
          ? `Actions: ${item.actions.join('; ')}`
          : 'No follow-up actions suggested.',
        insight: item,
      }));

      const selection = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select an insight to inspect',
        matchOnDetail: true,
      });

      if (selection?.insight) {
        const { insight } = selection;
        const actions = insight.actions.length
          ? `\n\nActions:\n${insight.actions.map((action: string) => `• ${action}`).join('\n')}`
          : '';
        await vscode.window.showInformationMessage(
          `${insight.summary}\nConfidence: ${Math.round(insight.confidence * 100)}%${actions}`,
        );
      }
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up. VS Code disposables handle lifecycle.
}

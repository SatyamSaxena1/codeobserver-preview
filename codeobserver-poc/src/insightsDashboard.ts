import * as vscode from 'vscode';
import { InsightStore, InsightExportPayload, TelemetrySnapshot } from './insightStore';

interface DashboardMessage {
  type: 'action';
  action: 'export' | 'clear';
}

interface DashboardSnapshot {
  insights: InsightExportPayload['insights'];
  telemetry: TelemetrySnapshot[];
}

export class InsightsDashboard {
  private panel: vscode.WebviewPanel | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: InsightStore) {}

  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      void this.postSnapshot();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'codeObserverInsightsDashboard',
      'CodeObserver Insights',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.webview.html = this.renderHtml();

    const changeSubscription = this.store.onDidChange(() => {
      void this.postSnapshot();
    });
    this.disposables.push(changeSubscription);

    this.panel.onDidDispose(() => {
      this.disposePanel();
    });

    this.panel.webview.onDidReceiveMessage(async (message: DashboardMessage) => {
      if (message.type !== 'action') {
        return;
      }

      if (message.action === 'export') {
        await vscode.commands.executeCommand('codeObserver.exportInsightHistory');
        return;
      }

      if (message.action === 'clear') {
        if (this.store.getHistoryCount() === 0) {
          await vscode.window.showInformationMessage('CodeObserver has no insights to clear.');
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          'Clear all CodeObserver insights stored for this workspace? This cannot be undone.',
          { modal: true },
          'Clear insights',
        );
        if (confirmation !== 'Clear insights') {
          return;
        }

        await this.store.clearHistory();
        await vscode.window.showInformationMessage('CodeObserver insight history has been cleared.');
      }
    });

    void this.postSnapshot();
  }

  private disposePanel(): void {
    this.panel = null;
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private async postSnapshot(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const snapshot = this.buildSnapshot();
    await this.panel.webview.postMessage({ type: 'data', payload: snapshot });
  }

  private buildSnapshot(): DashboardSnapshot {
    const exportPayload = this.store.getExportSnapshot();
    const insights = exportPayload.insights.map((insight) => ({
      ...insight,
      metadata: insight.metadata ?? {},
    }));
    return {
      insights,
      telemetry: this.store.getTelemetryHistory(),
    };
  }

  private renderHtml(): string {
  const nonce = generateNonce();
  const html = /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeObserver Insights</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Arial, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        line-height: 1.5;
      }

      body {
        margin: 0;
        padding: 0;
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }

      header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--vscode-editorWidget-border);
        position: sticky;
        top: 0;
        background-color: inherit;
        z-index: 1;
      }

      header button {
        border: 1px solid var(--vscode-button-border, transparent);
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        padding: 0.35rem 0.75rem;
        border-radius: 4px;
        cursor: pointer;
      }

      header button.primary {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      header button.danger {
        background-color: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-inputValidation-errorForeground);
      }

      header button.active {
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      header .spacer {
        flex: 1;
      }

      main {
        padding: 1rem;
        display: grid;
        gap: 0.75rem;
      }

      article {
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 6px;
        padding: 0.75rem 1rem;
        background-color: var(--vscode-editorWidget-background);
        display: grid;
        gap: 0.5rem;
      }

      article header {
        position: static;
        border: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      article header h2 {
        font-size: 1rem;
        margin: 0;
      }

      article header span.meta {
        font-size: 0.75rem;
        opacity: 0.7;
      }

      article ul {
        margin: 0;
        padding-left: 1.2rem;
      }

      article ul li {
        margin: 0.2rem 0;
      }

      .empty {
        text-align: center;
        padding: 3rem 1rem;
        opacity: 0.7;
      }
    </style>
  </head>
  <body>
    <header>
      <button data-filter="all" class="active">All</button>
      <button data-filter="lmstudio">LM Studio</button>
      <button data-filter="fallback">Fallback</button>
      <div class="spacer"></div>
      <button data-action="export" class="primary">Export</button>
      <button data-action="clear" class="danger">Clear</button>
    </header>
    <main id="insight-list">
      <p class="empty">Loading insights…</p>
    </main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const state = { filter: 'all', insights: [], telemetry: [] };

      const filterButtons = Array.from(document.querySelectorAll('button[data-filter]'));
      const actionButtons = Array.from(document.querySelectorAll('button[data-action]'));
      const list = document.getElementById('insight-list');

      function setFilter(filter) {
        state.filter = filter;
        vscode.setState({ filter });
        render();
      }

      function handleFilterClick(event) {
        const target = event.currentTarget;
        const filter = target.getAttribute('data-filter');
        if (!filter) {
          return;
        }
        filterButtons.forEach((button) => button.classList.toggle('active', button === target));
        setFilter(filter);
      }

      function handleActionClick(event) {
        const action = event.currentTarget.getAttribute('data-action');
        if (!action) {
          return;
        }
        vscode.postMessage({ type: 'action', action });
      }

      filterButtons.forEach((button) => button.addEventListener('click', handleFilterClick));
      actionButtons.forEach((button) => button.addEventListener('click', handleActionClick));

      window.addEventListener('message', (event) => {
        const { type, payload } = event.data || {};
        if (type !== 'data' || !payload) {
          return;
        }
        state.insights = Array.isArray(payload.insights) ? payload.insights : [];
        state.telemetry = Array.isArray(payload.telemetry) ? payload.telemetry : [];
        render();
      });

      function render() {
        const filter = state.filter || 'all';
        const insights = state.insights.filter((insight) => {
          if (filter === 'all') {
            return true;
          }
          const source = String(insight.metadata?.source ?? 'unknown');
          if (filter === 'lmstudio') {
            return source === 'lmstudio';
          }
          return source !== 'lmstudio';
        });

        if (!insights.length) {
          list.innerHTML = '<p class="empty">No insights captured yet. Activate CodeObserver and start coding to populate the dashboard.</p>';
          return;
        }

        list.innerHTML = insights
          .map((insight) => renderInsight(insight))
          .join('');
      }

      function renderInsight(insight) {
        const date = new Date(insight.timestamp).toLocaleString();
        const source = insight.metadata?.source ?? 'unknown';
        const reason = insight.metadata?.reason ? ' • ' + insight.metadata.reason : '';
        const confidence = Math.round((insight.confidence ?? 0) * 100) + '% confidence';
        const files = Array.isArray(insight.metadata?.files) ? insight.metadata.files : [];
        const fileInfo = files.length ? '<div>Files: ' + files.join(', ') + '</div>' : '';
        const actions = Array.isArray(insight.actions) && insight.actions.length
          ? '<ul>' + insight.actions.map((action) => '<li>' + escapeHtml(action) + '</li>').join('') + '</ul>'
          : '<div>No follow-up actions suggested.</div>';

        return [
          '<article>',
          '<header>',
          '<h2>' + escapeHtml(insight.summary ?? '') + '</h2>',
          '<span class="meta">' + date + ' • ' + escapeHtml(source) + reason + ' • ' + confidence + '</span>',
          '</header>',
          fileInfo,
          actions,
          '</article>',
        ].join('');
      }

      function escapeHtml(value) {
        if (typeof value !== 'string') {
          return '';
        }
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      const restored = vscode.getState();
      if (restored?.filter) {
        const button = filterButtons.find((item) => item.getAttribute('data-filter') === restored.filter);
        if (button) {
          filterButtons.forEach((item) => item.classList.toggle('active', item === button));
          state.filter = restored.filter;
        }
      }
      render();
    </script>
  </body>
</html>`;

    return html;
  }
}

function generateNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

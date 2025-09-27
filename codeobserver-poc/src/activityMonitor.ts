import * as vscode from 'vscode';
import { ActivityEvent } from './types';

export type ActivityCallback = (activity: ActivityEvent) => void;

type CommandExecutionEventLike = {
  command: string;
  arguments?: readonly unknown[];
};

export class ActivityMonitor implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly onActivity: ActivityCallback) {}

  public start(): void {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
        this.onActivity({
          kind: 'documentOpen',
          uri: document.uri.toString(true),
          languageId: document.languageId,
          details: {
            wordCount: document.getText().split(/\s+/).filter(Boolean).length,
          },
          timestamp: Date.now(),
        });
      }),
      vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
        const edits = event.contentChanges.map((change: vscode.TextDocumentContentChangeEvent) => ({
          rangeLength: change.rangeLength,
          textLength: change.text.length,
        }));

        this.onActivity({
          kind: 'documentChange',
          uri: event.document.uri.toString(true),
          languageId: event.document.languageId,
          details: {
            changeCount: event.contentChanges.length,
            edits,
          },
          timestamp: Date.now(),
        });
      }),
      vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        this.onActivity({
          kind: 'documentSave',
          uri: document.uri.toString(true),
          languageId: document.languageId,
          details: {
            lineCount: document.lineCount,
          },
          timestamp: Date.now(),
        });
      }),
      vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
        const active = event.textEditor.document;
        this.onActivity({
          kind: 'selectionChange',
          uri: active.uri.toString(true),
          languageId: active.languageId,
          details: {
            selections: event.selections.length,
          },
          timestamp: Date.now(),
        });
      }),
    );

    const commandApi = vscode.commands as typeof vscode.commands & {
      onDidExecuteCommand?: (
        listener: (event: CommandExecutionEventLike) => unknown,
      ) => vscode.Disposable;
    };

    if (typeof commandApi.onDidExecuteCommand === 'function') {
      this.disposables.push(
        commandApi.onDidExecuteCommand((event: CommandExecutionEventLike) => {
          if (!event.command.startsWith('github.copilot')) {
            return;
          }

          this.onActivity({
            kind: 'copilotCommand',
            uri: `command://${event.command}`,
            details: {
              argumentCount: event.arguments?.length ?? 0,
            },
            timestamp: Date.now(),
          });
        }),
      );
    }
  }

  public dispose(): void {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

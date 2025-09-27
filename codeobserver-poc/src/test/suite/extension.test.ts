import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test } from 'mocha';

suite('CodeObserver Extension', () => {
  void vscode.window.showInformationMessage('Starting CodeObserver test suite.');

  test('registers CodeObserver commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('codeObserver.showInsights'));
    assert.ok(commands.includes('codeObserver.analyzeWorkspace'));
    assert.ok(commands.includes('codeObserver.showInsightHistory'));
  });

  test('activates without errors', async () => {
    const extension = vscode.extensions.getExtension('codeobserver.codeobserver-poc');
    assert.ok(extension, 'CodeObserver extension should be discoverable.');
    await extension?.activate();
    assert.ok(extension?.isActive);
  });
});

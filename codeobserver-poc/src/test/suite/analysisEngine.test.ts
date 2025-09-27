import * as assert from 'assert';
import { suite, test } from 'mocha';
import { AnalysisEngine } from '../../analysisEngine';
import { ActivityEvent } from '../../types';

class StubLmStudioClient {
  public readonly prompts: string[] = [];
  private response: string | Error;

  constructor(response: string | Error) {
    this.response = response;
  }

  setResponse(next: string | Error): void {
    this.response = next;
  }

  async chat(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    if (this.response instanceof Error) {
      throw this.response;
    }
    return this.response;
  }
}

const sampleEvents: ActivityEvent[] = [
  {
    kind: 'documentChange',
    uri: 'file:///workspace/file.ts',
    languageId: 'typescript',
    details: { changeSummary: 'Edited function body.' },
    timestamp: Date.now(),
  },
  {
    kind: 'documentSave',
    uri: 'file:///workspace/file.ts',
    languageId: 'typescript',
    details: { reason: 'manualSave' },
    timestamp: Date.now(),
  },
];

suite('AnalysisEngine', () => {
  test('falls back to deterministic insight when LM Studio client is absent', async () => {
    const engine = new AnalysisEngine({ objectives: ['Protect module boundaries'] });

    const result = await engine.run({
      events: sampleEvents,
      objectives: ['Protect module boundaries'],
      reason: 'manual',
    });

    assert.strictEqual(result.metadata?.source, 'local-fallback');
    assert.ok(result.summary.includes('Protect module boundaries'));
  });

  test('uses LM Studio client when available', async () => {
    const stub = new StubLmStudioClient(
      JSON.stringify({
        summary: 'Strategic focus confirmed.',
        confidence: 0.82,
        actions: ['Double-check recent refactors.'],
      }),
    );
    const engine = new AnalysisEngine({
      objectives: ['Maintain architectural consistency'],
      lmStudioClient: stub,
    });

    const result = await engine.run({
      events: sampleEvents,
      objectives: ['Maintain architectural consistency'],
      reason: 'manual',
    });

    assert.strictEqual(result.metadata?.source, 'lmstudio');
    assert.deepStrictEqual(result.actions, ['Double-check recent refactors.']);
    assert.strictEqual(stub.prompts.length, 1);
  });

  test('uses fallback when LM Studio client throws', async () => {
    const stub = new StubLmStudioClient(new Error('simulated failure'));
    const engine = new AnalysisEngine({
      objectives: ['Keep codebase aligned with objectives'],
      lmStudioClient: stub,
    });

    const result = await engine.run({
      events: sampleEvents,
      objectives: ['Keep codebase aligned with objectives'],
      reason: 'manual',
    });

    assert.strictEqual(result.metadata?.source, 'lmstudio-fallback');
    assert.match(String(result.metadata?.errorMessage ?? ''), /simulated failure/i);
    assert.strictEqual(stub.prompts.length, 1);
  });

  test('stops retrying LM Studio after failure until client is refreshed', async () => {
    const stub = new StubLmStudioClient(new Error('transient outage'));
    const engine = new AnalysisEngine({
      objectives: ['Protect shared services'],
      lmStudioClient: stub,
    });

    const first = await engine.run({
      events: sampleEvents,
      objectives: ['Protect shared services'],
      reason: 'autosave',
    });

    assert.strictEqual(first.metadata?.source, 'lmstudio-fallback');
    assert.strictEqual(stub.prompts.length, 1);

    stub.setResponse(
      JSON.stringify({ summary: 'Recovered successfully.', confidence: 0.75, actions: [] }),
    );

    const second = await engine.run({
      events: sampleEvents,
      objectives: ['Protect shared services'],
      reason: 'autosave',
    });

    assert.strictEqual(second.metadata?.source, 'lmstudio-fallback');
    assert.strictEqual(stub.prompts.length, 1, 'LM Studio should not be retried while unhealthy.');

    engine.updateLmStudioClient(stub);

    const third = await engine.run({
      events: sampleEvents,
      objectives: ['Protect shared services'],
      reason: 'manual',
    });

    assert.strictEqual(third.metadata?.source, 'lmstudio');
    assert.strictEqual(stub.prompts.length, 2);
  });
});

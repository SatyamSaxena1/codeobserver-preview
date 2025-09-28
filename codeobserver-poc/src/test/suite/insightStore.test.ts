import * as assert from 'assert';
import { suite, test } from 'mocha';
import type { Memento } from 'vscode';
import { InsightStore } from '../../insightStore';
import { StrategicInsight } from '../../types';

class MemoryMemento implements Memento {
  private readonly store = new Map<string, unknown>();

  constructor(initial?: Record<string, unknown>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        this.store.set(key, value);
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    return defaultValue as T;
  }

  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
    return Promise.resolve();
  }

  keys(): readonly string[] {
    return Array.from(this.store.keys());
  }
}

const makeInsight = (id: string, timestamp: number): StrategicInsight => ({
  id,
  summary: `Summary for ${id}`,
  confidence: 0.75,
  actions: ['Review key changes'],
  timestamp,
  metadata: {
    source: 'local-fallback',
    files: ['file:///workspace/example.ts'],
    languages: ['typescript'],
    changeCount: 4,
    saveCount: 1,
    reason: 'autosave',
  },
});

suite('InsightStore', () => {
  test('restores history from storage', () => {
    const storedInsights = [makeInsight('restored', 1)];
    const memento = new MemoryMemento({
      'codeObserver.insightHistory': storedInsights,
    });

    const store = new InsightStore({ storage: memento });

    assert.strictEqual(store.getHistoryCount(), 1);
    const latest = store.getLatest();
    assert.ok(latest);
    assert.strictEqual(latest?.id, 'restored');
    assert.strictEqual(latest?.summary, 'Summary for restored');
  });

  test('persists new insights to storage', () => {
    const memento = new MemoryMemento();
    const store = new InsightStore({ storage: memento });

    const fresh = makeInsight('fresh', Date.now());
    store.setLatest(fresh);

    const stored = memento.get<StrategicInsight[]>('codeObserver.insightHistory', []);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].id, 'fresh');
    assert.strictEqual(stored[0].summary, fresh.summary);
  });

  test('caps history at configured limit', () => {
    const memento = new MemoryMemento();
    const store = new InsightStore({ storage: memento, maxHistoryItems: 2 });

    store.setLatest(makeInsight('first', 1));
    store.setLatest(makeInsight('second', 2));
    store.setLatest(makeInsight('third', 3));

    assert.strictEqual(store.getHistoryCount(), 2);
    const history = store.getHistory();
    assert.deepStrictEqual(
      history.map((insight) => insight.id),
      ['third', 'second'],
    );

    const stored = memento.get<StrategicInsight[]>('codeObserver.insightHistory', []);
    assert.strictEqual(stored.length, 2);
    assert.deepStrictEqual(
      stored.map((insight) => insight.id),
      ['third', 'second'],
    );
  });

  test('clears history and telemetry', async () => {
    const memento = new MemoryMemento();
    const store = new InsightStore({ storage: memento });

    store.setLatest(makeInsight('first', 1));
    store.setLatest(makeInsight('second', 2));

    assert.strictEqual(store.getHistoryCount(), 2);
    assert.ok(store.getTelemetryHistory().length > 0);

    await store.clearHistory();

    assert.strictEqual(store.getHistoryCount(), 0);
    assert.strictEqual(store.getTelemetryHistory().length, 0);

    const persistedInsights = memento.get<StrategicInsight[]>('codeObserver.insightHistory', []);
    assert.strictEqual(persistedInsights.length, 0);
    const persistedTelemetry = memento.get('codeObserver.telemetryHistory', []);
    assert.strictEqual((persistedTelemetry as unknown[]).length, 0);
  });

  test('exports sanitized snapshot', () => {
    const memento = new MemoryMemento();
    const store = new InsightStore({ storage: memento });

    const insight = {
      ...makeInsight('exportable', 3),
      metadata: {
        source: 'lmstudio',
        files: ['file:///workspace/path/to/example.ts?hash=123'],
        languages: ['typescript'],
        changeCount: 5,
        saveCount: 2,
        reason: 'manual',
        rawResponse: '{"noisy":true}',
      },
    } satisfies StrategicInsight;

    store.setLatest(insight);

    const snapshot = store.getExportSnapshot();
    assert.strictEqual(snapshot.insightCount, 1);
    assert.strictEqual(snapshot.telemetryCount, snapshot.telemetry.length);
    const exportedInsight = snapshot.insights[0];
    assert.deepStrictEqual(exportedInsight.actions, insight.actions);
    assert.ok(exportedInsight.metadata);
    assert.deepStrictEqual(exportedInsight.metadata?.files, ['example.ts']);
    assert.strictEqual(exportedInsight.metadata?.rawResponse, undefined);
  });

  test('records telemetry with anonymized extensions', () => {
    const memento = new MemoryMemento();
    const store = new InsightStore({ storage: memento });

    store.setLatest(makeInsight('telemetry', Date.now()));

    const telemetry = store.getTelemetryHistory();
    assert.strictEqual(telemetry.length, 1);
    const snapshot = telemetry[0];
    assert.strictEqual(snapshot.languageCount, 1);
    assert.ok(snapshot.fileExtensions.includes('ts'));
    assert.strictEqual(snapshot.reason, 'autosave');
    assert.strictEqual(snapshot.source, 'local-fallback');
  });
});

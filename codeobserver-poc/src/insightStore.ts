import { EventEmitter, type Event, type Memento } from 'vscode';
import { StrategicInsight } from './types';

const DEFAULT_MAX_HISTORY_ITEMS = 20;
const DEFAULT_STORAGE_KEY = 'codeObserver.insightHistory';
const DEFAULT_TELEMETRY_STORAGE_KEY = 'codeObserver.telemetryHistory';
const DEFAULT_MAX_TELEMETRY_ITEMS = 100;

interface InsightStoreOptions {
  storage?: Memento;
  storageKey?: string;
  maxHistoryItems?: number;
  telemetryStorageKey?: string;
  maxTelemetryItems?: number;
}

type StoredInsight = Omit<StrategicInsight, 'metadata'> & {
  metadata?: Record<string, unknown>;
};

export interface TelemetrySnapshot {
  timestamp: number;
  languageCount: number;
  fileExtensions: string[];
  changeCount?: number;
  saveCount?: number;
  confidence: number;
  reason?: string;
  source?: string;
}

export interface InsightExportPayload {
  generatedAt: number;
  insightCount: number;
  telemetryCount: number;
  insights: StoredInsight[];
  telemetry: TelemetrySnapshot[];
}

export class InsightStore {
  private latest?: StrategicInsight;
  private readonly history: StrategicInsight[] = [];
  private readonly storage?: Memento;
  private readonly storageKey: string;
  private readonly maxHistoryItems: number;
  private readonly telemetryHistory: TelemetrySnapshot[] = [];
  private readonly telemetryStorageKey: string;
  private readonly maxTelemetryItems: number;
  private readonly changeEmitter = new EventEmitter<StrategicInsight[]>();

  constructor(options: InsightStoreOptions = {}) {
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxHistoryItems = options.maxHistoryItems ?? DEFAULT_MAX_HISTORY_ITEMS;
    this.telemetryStorageKey = options.telemetryStorageKey ?? DEFAULT_TELEMETRY_STORAGE_KEY;
    this.maxTelemetryItems = options.maxTelemetryItems ?? DEFAULT_MAX_TELEMETRY_ITEMS;

    if (this.storage) {
      this.restoreFromStorage();
      this.restoreTelemetry();
    }
  }

  public setLatest(insight: StrategicInsight): void {
    const cloned = this.cloneInsight(insight);
    this.latest = cloned;
    this.history.unshift(cloned);
    if (this.history.length > this.maxHistoryItems) {
      this.history.length = this.maxHistoryItems;
    }
    void this.persist();
    this.recordTelemetry(cloned);
    this.changeEmitter.fire(this.getHistory());
  }

  public getLatest(): StrategicInsight | undefined {
    return this.latest ? this.cloneInsight(this.latest) : undefined;
  }

  public getHistory(): StrategicInsight[] {
    return this.history.map((item) => this.cloneInsight(item));
  }

  public getHistoryCount(): number {
    return this.history.length;
  }

  public getTelemetryHistory(): TelemetrySnapshot[] {
    return this.telemetryHistory.map((item) => ({ ...item, fileExtensions: [...item.fileExtensions] }));
  }

  public getExportSnapshot(): InsightExportPayload {
    const insights = this.history.map((item) => this.toStoredInsight(item));
    const telemetry = this.getTelemetryHistory();
    return {
      generatedAt: Date.now(),
      insightCount: insights.length,
      telemetryCount: telemetry.length,
      insights,
      telemetry,
    };
  }

  public async clearHistory(): Promise<void> {
    if (!this.history.length && !this.telemetryHistory.length) {
      return;
    }

    this.history.length = 0;
    this.telemetryHistory.length = 0;
    this.latest = undefined;
    await Promise.all([this.persistHistory([]), this.persistTelemetry([])]);
    this.changeEmitter.fire([]);
  }

  public readonly onDidChange: Event<StrategicInsight[]> = this.changeEmitter.event;

  private restoreFromStorage(): void {
    const payload = this.storage?.get<StoredInsight[]>(this.storageKey);
    if (!Array.isArray(payload) || payload.length === 0) {
      return;
    }

    const restored = payload
      .filter((candidate): candidate is StoredInsight => this.isInsightLike(candidate))
      .map((candidate) => this.normalizeStoredInsight(candidate))
      .slice(0, this.maxHistoryItems);

    if (!restored.length) {
      return;
    }

    this.history.push(...restored);
    this.latest = restored[0];
  }

  private restoreTelemetry(): void {
    const payload = this.storage?.get<TelemetrySnapshot[]>(this.telemetryStorageKey);
    if (!Array.isArray(payload) || payload.length === 0) {
      return;
    }

    const restored = payload
      .filter((candidate): candidate is TelemetrySnapshot => this.isTelemetrySnapshot(candidate))
      .map((candidate) => this.normalizeTelemetry(candidate))
      .slice(0, this.maxTelemetryItems);

    if (!restored.length) {
      return;
    }

    this.telemetryHistory.push(...restored);
  }

  private persist(): void {
    if (!this.storage) {
      return;
    }

    void this.persistHistory(this.history.map((item) => this.cloneInsight(item)));
  }

  private async persistHistory(payload: StrategicInsight[]): Promise<void> {
    if (!this.storage) {
      return;
    }
    const serialized = payload.map((item) => this.cloneInsight(item));
    await this.storage.update(this.storageKey, serialized as StoredInsight[]);
  }

  private async persistTelemetry(payload?: TelemetrySnapshot[]): Promise<void> {
    if (!this.storage) {
      return;
    }

    const snapshot = (payload ?? this.telemetryHistory).map((item) => ({
      ...item,
      fileExtensions: [...item.fileExtensions],
    }));
    await this.storage.update(this.telemetryStorageKey, snapshot);
  }

  private cloneInsight(insight: StrategicInsight): StrategicInsight {
    return {
      ...insight,
      actions: [...insight.actions],
      metadata: insight.metadata ? this.deepCloneMetadata(insight.metadata) : undefined,
    };
  }

  private toStoredInsight(insight: StrategicInsight): StoredInsight {
    const clone = this.cloneInsight(insight);
    const metadata = clone.metadata ? this.sanitizeMetadataForExport(clone.metadata) : undefined;
    return {
      id: clone.id,
      summary: clone.summary,
      confidence: clone.confidence,
      actions: [...clone.actions],
      timestamp: clone.timestamp,
      metadata,
    };
  }

  private deepCloneMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
    } catch (error) {
      void error;
      const snapshot: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(metadata)) {
        snapshot[key] = this.toSerializable(value);
      }
      return snapshot;
    }
  }

  private toSerializable(value: unknown): unknown {
    if (value === null) {
      return null;
    }

    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.toSerializable(item));
    }

    if (type === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        void error;
        return String(value);
      }
    }

    return String(value);
  }

  private isInsightLike(value: unknown): value is StoredInsight {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<StoredInsight>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.summary === 'string' &&
      typeof candidate.confidence === 'number' &&
      typeof candidate.timestamp === 'number' &&
      Array.isArray(candidate.actions)
    );
  }

  private normalizeStoredInsight(candidate: StoredInsight): StrategicInsight {
    const actions = Array.isArray(candidate.actions)
      ? candidate.actions.map((action) => String(action))
      : [];

    const metadata = candidate.metadata ? this.deepCloneMetadata(candidate.metadata) : undefined;

    return {
      id: String(candidate.id),
      summary: String(candidate.summary),
      confidence: Number(candidate.confidence),
      actions,
      timestamp: Number(candidate.timestamp),
      metadata,
    };
  }

  private sanitizeMetadataForExport(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (key === 'rawResponse') {
        continue;
      }

      if (key === 'files' && Array.isArray(value)) {
        sanitized.files = this.extractFileNames(value as unknown[]);
        continue;
      }

      sanitized[key] = this.toSerializable(value);
    }
    return sanitized;
  }

  private recordTelemetry(insight: StrategicInsight): void {
    const metadata = insight.metadata ?? {};
    const files = Array.isArray(metadata.files) ? (metadata.files as unknown[]) : [];
    const languages = Array.isArray(metadata.languages)
      ? (metadata.languages as unknown[])
      : [];
    const fileExtensions = this.extractFileExtensions(files);
    const changeCount = this.toNumeric(metadata.changeCount);
    const saveCount = this.toNumeric(metadata.saveCount);
    const reason = typeof metadata.reason === 'string' ? metadata.reason : undefined;
    const source = typeof metadata.source === 'string' ? metadata.source : undefined;

    const snapshot: TelemetrySnapshot = {
      timestamp: insight.timestamp,
      languageCount: languages.length,
      fileExtensions,
      changeCount: changeCount ?? undefined,
      saveCount: saveCount ?? undefined,
      confidence: insight.confidence,
      reason,
      source,
    };

    this.telemetryHistory.unshift(snapshot);
    if (this.telemetryHistory.length > this.maxTelemetryItems) {
      this.telemetryHistory.length = this.maxTelemetryItems;
    }
    void this.persistTelemetry();
  }

  private extractFileNames(raw: unknown[]): string[] {
    const names = new Set<string>();
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        continue;
      }
      const name = this.extractFileName(entry);
      if (name) {
        names.add(name);
      }
    }
    return Array.from(names);
  }

  private extractFileExtensions(raw: unknown[]): string[] {
    const extensions = new Map<string, number>();
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        continue;
      }
      const ext = this.extractExtension(entry);
      if (!ext) {
        continue;
      }
      extensions.set(ext, (extensions.get(ext) ?? 0) + 1);
    }
    return Array.from(extensions.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key);
  }

  private extractFileName(uri: string): string | undefined {
    const withoutQuery = uri.split('?')[0];
    const segments = withoutQuery.split(/[\\/]/);
    const candidate = segments.pop();
    if (!candidate) {
      return undefined;
    }

    try {
      return decodeURIComponent(candidate);
    } catch (error) {
      void error;
      return candidate;
    }
  }

  private extractExtension(uri: string): string | undefined {
    const name = this.extractFileName(uri);
    if (!name) {
      return undefined;
    }
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
      return name.toLowerCase();
    }
    return name.slice(lastDot + 1).toLowerCase();
  }

  private toNumeric(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }

  private isTelemetrySnapshot(value: unknown): value is TelemetrySnapshot {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<TelemetrySnapshot>;
    return (
      typeof candidate.timestamp === 'number' &&
      typeof candidate.languageCount === 'number' &&
      Array.isArray(candidate.fileExtensions)
    );
  }

  private normalizeTelemetry(candidate: TelemetrySnapshot): TelemetrySnapshot {
    return {
      timestamp: Number(candidate.timestamp),
      languageCount: Number(candidate.languageCount) || 0,
      fileExtensions: Array.isArray(candidate.fileExtensions)
        ? candidate.fileExtensions.map((item) => String(item))
        : [],
      changeCount: this.toNumeric(candidate.changeCount),
      saveCount: this.toNumeric(candidate.saveCount),
      confidence: Number(candidate.confidence) || 0,
      reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
      source: typeof candidate.source === 'string' ? candidate.source : undefined,
    };
  }
}

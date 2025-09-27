import { StrategicInsight } from './types';

const MAX_HISTORY_ITEMS = 20;

export class InsightStore {
  private latest?: StrategicInsight;
  private readonly history: StrategicInsight[] = [];

  public setLatest(insight: StrategicInsight): void {
    this.latest = insight;
    this.history.unshift(insight);
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history.pop();
    }
  }

  public getLatest(): StrategicInsight | undefined {
    return this.latest;
  }

  public getHistory(): StrategicInsight[] {
    return [...this.history];
  }
}

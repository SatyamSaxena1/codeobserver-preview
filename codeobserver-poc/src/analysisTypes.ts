import { ActivityEvent } from './types';

export interface AnalysisContext {
  events: ActivityEvent[];
  objectives: string[];
  reason: string;
}

export interface ActivityStats {
  files: string[];
  languages: string[];
  changeCount: number;
  saveCount: number;
  eventCount: number;
  recentEvents: string[];
}

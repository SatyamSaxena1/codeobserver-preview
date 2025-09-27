export type ActivityKind =
  | 'documentOpen'
  | 'documentChange'
  | 'documentSave'
  | 'selectionChange'
  | 'copilotCommand'
  | 'analysisRequest';

export interface ActivityEvent {
  kind: ActivityKind;
  uri: string;
  languageId?: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface StrategicInsight {
  id: string;
  summary: string;
  confidence: number;
  actions: string[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

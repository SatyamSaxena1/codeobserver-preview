import { AnalysisContext, ActivityStats } from './analysisTypes';
import { ActivityEvent } from './types';

const describeEvent = (event: ActivityEvent, ordinal: number): string => {
  const timestamp = new Date(event.timestamp || Date.now()).toISOString();
  const language = event.languageId ? ` • ${event.languageId}` : '';
  const details = event.details ? JSON.stringify(event.details).slice(0, 180) : '';
  const detailSuffix = details ? ` • details: ${details}` : '';
  return `${ordinal}. ${event.kind} • ${timestamp}${language} • ${event.uri}${detailSuffix}`;
};

export const buildActivityStats = (context: AnalysisContext, maxEvents: number): ActivityStats => {
  const uniqueFiles = new Set<string>();
  const uniqueLanguages = new Set<string>();

  for (const event of context.events) {
    uniqueFiles.add(event.uri);
    if (event.languageId) {
      uniqueLanguages.add(event.languageId);
    }
  }

  const changeCount = context.events.filter((event) => event.kind === 'documentChange').length;
  const saveCount = context.events.filter((event) => event.kind === 'documentSave').length;

  const recentEvents = [...context.events]
    .slice(-maxEvents)
    .reverse()
    .map((event, index) => describeEvent(event, index + 1));

  return {
    files: Array.from(uniqueFiles),
    languages: Array.from(uniqueLanguages),
    changeCount,
    saveCount,
    eventCount: context.events.length,
    recentEvents,
  };
};

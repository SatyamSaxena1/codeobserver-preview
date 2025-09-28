import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LmStudioModelInfo {
  id: string;
  label: string;
  sizeBytes?: number;
  quantization?: string;
}

export class LmStudioCliError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LmStudioCliError';
  }
}

const FALLBACK_ARGS = ['models', 'list'];
const LIST_ARGS = ['models', 'list', '--downloaded', '--json'];

export async function listDownloadedModels(
  cliPath: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LmStudioModelInfo[]> {
  const timeout = options.timeoutMs ?? 10_000;
  const execOptions = {
    timeout,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    signal: options.signal,
  } satisfies Parameters<typeof execFileAsync>[2];

  try {
    const { stdout } = await execFileAsync(cliPath, LIST_ARGS, execOptions);
    const parsed = parseModelList(stdout);
    if (parsed.length) {
      return parsed;
    }
    // Fall back to non-JSON variant if JSON produced no entries
    const fallback = await execFileAsync(cliPath, FALLBACK_ARGS, execOptions).then((result) =>
      parsePlainModelList(result.stdout),
    );
    return fallback;
  } catch (error) {
    // Attempt fallback if JSON mode unsupported
    try {
      const { stdout } = await execFileAsync(cliPath, FALLBACK_ARGS, execOptions);
      const parsed = parsePlainModelList(stdout);
      if (!parsed.length) {
        throw new LmStudioCliError('LM Studio CLI returned no installed models.', error);
      }
      return parsed;
    } catch (fallbackError) {
      throw new LmStudioCliError('Failed to query LM Studio for downloaded models.', fallbackError);
    }
  }
}

function parseModelList(output: string): LmStudioModelInfo[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const data = JSON.parse(trimmed);
    const entries = Array.isArray(data)
      ? data
      : Array.isArray((data as { models?: unknown[] }).models)
        ? (data as { models: unknown[] }).models
        : Array.isArray((data as { items?: unknown[] }).items)
          ? (data as { items: unknown[] }).items
          : [];

    return entries
      .map((entry) => normaliseModelEntry(entry))
      .filter((item): item is LmStudioModelInfo => Boolean(item));
  } catch (error) {
    // JSON parse failure, fall back to text parser
    return parsePlainModelList(output);
  }
}

function normaliseModelEntry(entry: unknown): LmStudioModelInfo | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }

  const record = entry as Record<string, unknown>;
  const id = pickString(record, ['specifier', 'id', 'name', 'model', 'identifier']);
  if (!id) {
    return undefined;
  }

  const displayName = pickString(record, ['displayName', 'title', 'description', 'label']);
  const quantization = pickString(record, ['quantization', 'variant', 'dtype']);
  const size = pickNumber(record, ['sizeBytes', 'size', 'diskSizeBytes']);

  const label = buildLabel(id, displayName, quantization, size);
  return {
    id,
    label,
    quantization,
    sizeBytes: size,
  };
}

function parsePlainModelList(output: string): LmStudioModelInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const firstWhitespace = line.search(/\s/);
      const id = firstWhitespace > 0 ? line.slice(0, firstWhitespace) : line;
      const rest = firstWhitespace > 0 ? line.slice(firstWhitespace).trim() : '';
      const label = rest ? `${id} — ${rest}` : id;
      return { id, label } satisfies LmStudioModelInfo;
    });
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;
    if (typeof numeric === 'number' && Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return undefined;
}

function buildLabel(id: string, displayName?: string, quantization?: string, sizeBytes?: number): string {
  const parts: string[] = [];
  if (displayName && displayName !== id) {
    parts.push(displayName);
  }
  if (quantization) {
    parts.push(quantization);
  }
  if (typeof sizeBytes === 'number') {
    const sizeMiB = sizeBytes / (1024 * 1024);
    parts.push(`${sizeMiB.toFixed(0)} MiB`);
  }
  const suffix = parts.length ? ` — ${parts.join(' · ')}` : '';
  return `${id}${suffix}`;
}

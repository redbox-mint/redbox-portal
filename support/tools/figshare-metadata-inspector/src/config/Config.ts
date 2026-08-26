import path from 'node:path';
import { normaliseFigshareBaseUrl } from '../figshare/FigshareClient';

export interface InspectorConfigValues {
  token: string;
  baseUrl: string;
  outputDirectory: string;
  timeoutMs: number;
  maxAttempts: number;
  groupId: number;
  raw: boolean;
  rawOnly: boolean;
  verbose: boolean;
}

export interface ParsedInspectorConfig {
  config?: InspectorConfigValues;
  help: boolean;
}

interface CliValues {
  token?: string;
  baseUrl?: string;
  outputDirectory?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  groupId?: number;
  raw?: boolean;
  rawOnly?: boolean;
  verbose?: boolean;
  help?: boolean;
}

function valueAfter(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value == null || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function parseCli(args: string[]): CliValues {
  const values: CliValues = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--token':
        values.token = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--api-url':
      case '--base-url':
        values.baseUrl = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--output':
        values.outputDirectory = valueAfter(args, index, argument);
        index += 1;
        break;
      case '--timeout':
        values.timeoutMs = positiveInteger(valueAfter(args, index, argument), argument);
        index += 1;
        break;
      case '--attempts':
        values.maxAttempts = positiveInteger(valueAfter(args, index, argument), argument);
        index += 1;
        break;
      case '--group-id':
        values.groupId = positiveInteger(valueAfter(args, index, argument), argument);
        index += 1;
        break;
      case '--raw':
        values.raw = true;
        break;
      case '--no-raw':
        values.raw = false;
        break;
      case '--raw-only':
        values.rawOnly = true;
        values.raw = true;
        break;
      case '--verbose':
        values.verbose = true;
        break;
      case '--help':
      case '-h':
        values.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }
  return values;
}

function envInteger(value: string | undefined, name: string, fallback: number): number {
  return value == null || value === '' ? fallback : positiveInteger(value, name);
}

export class Config {
  public static parse(
    args: string[] = process.argv.slice(2),
    environment: NodeJS.ProcessEnv = process.env,
    currentDirectory: string = process.cwd()
  ): ParsedInspectorConfig {
    const cli = parseCli(args);
    if (cli.help === true) {
      return { help: true };
    }
    // Precedence is intentionally CLI > environment > built-in default.
    const token = cli.token ?? environment.FIGSHARE_TOKEN;
    if (token == null || token.trim() === '') {
      throw new Error('FIGSHARE_TOKEN or --token is required');
    }
    const baseUrl = cli.baseUrl ?? environment.FIGSHARE_API_URL ?? 'https://api.figsh.com';
    const output = cli.outputDirectory ?? environment.FIGSHARE_OUTPUT ?? './output';
    return {
      help: false,
      config: {
        token,
        baseUrl: normaliseFigshareBaseUrl(baseUrl),
        outputDirectory: path.resolve(currentDirectory, output),
        timeoutMs: cli.timeoutMs ?? envInteger(environment.FIGSHARE_TIMEOUT_MS, 'FIGSHARE_TIMEOUT_MS', 30_000),
        maxAttempts: cli.maxAttempts ?? envInteger(environment.FIGSHARE_MAX_ATTEMPTS, 'FIGSHARE_MAX_ATTEMPTS', 3),
        groupId: cli.groupId ?? envInteger(environment.FIGSHARE_GROUP_ID, 'FIGSHARE_GROUP_ID', 32014),
        raw: cli.raw ?? true,
        rawOnly: cli.rawOnly ?? false,
        verbose: cli.verbose ?? false,
      },
    };
  }

  public static helpText(): string {
    return [
      'Usage: figshare-inspect [options]',
      '',
      'Options:',
      '  --token <token>       Figshare personal API token (overrides FIGSHARE_TOKEN)',
      '  --api-url <url>       Figshare API root (overrides FIGSHARE_API_URL)',
      '  --output <directory>  Report directory (default: ./output)',
      '  --timeout <ms>        HTTP timeout in milliseconds (default: 30000)',
      '  --attempts <count>    Attempts for transient GET failures (default: 3)',
      '  --group-id <id>       CQU Figshare group id (staging default: 32014)',
      '  --raw                 Write raw responses (enabled by default)',
      '  --no-raw              Do not write raw responses',
      '  --raw-only            Write raw responses without normalised reports',
      '  --verbose             Print endpoint and rate-limit diagnostics',
      '  -h, --help            Show this help',
      '',
      'Configuration precedence: command-line option, environment variable, default.',
    ].join('\n');
  }
}

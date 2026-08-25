export interface GenerationConfig {
  enabled: boolean;
  adapters: string[];
  bootstrap: {
    enabled: boolean;
    directory: string;
  };
  artifacts: {
    encryptionKeyRef: string;
    encryptionKeyId: string;
    operationalExpiryMinutes: number;
    diagnosticRetentionDays: number;
    maxDiagnosticRetentionDays: number;
  };
  provider: {
    timeoutMs: number;
    maxRequestBytes: number;
    maxResponseBytes: number;
    maxRetries: number;
  };
  context: {
    maxTotalBytes: number;
    maxFieldBytes: number;
    maxKnowledgeChunks: number;
    maxChunkBytes: number;
  };
  queue: {
    executeJobName: string;
    cleanupJobName: string;
    concurrency: number;
    lockLifetimeMs: number;
  };
  limits: {
    perUserConcurrentRuns: number;
    perBrandConcurrentRuns: number;
    perUserDailyRuns: number;
    perBrandDailyRuns: number;
  };
  polling: {
    minMs: number;
    maxMs: number;
  };
  outbound: {
    allowedHosts: string[];
  };
  diagnostics: {
    allowAdminDiagnostics: boolean;
  };
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return value.trim().toLowerCase() === 'true';
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envList(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  return value === undefined
    ? fallback
    : value.split(',').map((item) => item.trim()).filter(Boolean);
}

export const generation: GenerationConfig = {
  enabled: envBoolean('sails__generation_enabled', false),
  adapters: envList('sails__generation_adapters', ['bedrock', 'openrouter', 'fake']),
  bootstrap: {
    enabled: envBoolean('sails__generation_bootstrap_enabled', true),
    directory: process.env['sails__generation_bootstrap_directory'] ?? 'generation',
  },
  artifacts: {
    encryptionKeyRef: process.env['sails__generation_artifacts_encryptionKeyRef'] ?? '',
    encryptionKeyId: process.env['sails__generation_artifacts_encryptionKeyId'] ?? 'generation-v1',
    operationalExpiryMinutes: envNumber('sails__generation_artifacts_operationalExpiryMinutes', 120),
    diagnosticRetentionDays: envNumber('sails__generation_artifacts_diagnosticRetentionDays', 7),
    maxDiagnosticRetentionDays: 30,
  },
  provider: {
    timeoutMs: envNumber('sails__generation_provider_timeoutMs', 90_000),
    maxRequestBytes: envNumber('sails__generation_provider_maxRequestBytes', 512_000),
    maxResponseBytes: envNumber('sails__generation_provider_maxResponseBytes', 256_000),
    maxRetries: envNumber('sails__generation_provider_maxRetries', 1),
  },
  context: {
    maxTotalBytes: envNumber('sails__generation_context_maxTotalBytes', 256_000),
    maxFieldBytes: envNumber('sails__generation_context_maxFieldBytes', 16_000),
    maxKnowledgeChunks: envNumber('sails__generation_context_maxKnowledgeChunks', 40),
    maxChunkBytes: envNumber('sails__generation_context_maxChunkBytes', 8_000),
  },
  queue: {
    executeJobName: 'GenerationRunService-Execute',
    cleanupJobName: 'GenerationRunService-ExpireArtifacts',
    concurrency: envNumber('sails__generation_queue_concurrency', 2),
    lockLifetimeMs: envNumber('sails__generation_queue_lockLifetimeMs', 120_000),
  },
  limits: {
    perUserConcurrentRuns: envNumber('sails__generation_limits_perUserConcurrentRuns', 2),
    perBrandConcurrentRuns: envNumber('sails__generation_limits_perBrandConcurrentRuns', 10),
    perUserDailyRuns: envNumber('sails__generation_limits_perUserDailyRuns', 25),
    perBrandDailyRuns: envNumber('sails__generation_limits_perBrandDailyRuns', 500),
  },
  polling: {
    minMs: envNumber('sails__generation_polling_minMs', 1_000),
    maxMs: envNumber('sails__generation_polling_maxMs', 10_000),
  },
  outbound: {
    allowedHosts: envList('sails__generation_outbound_allowedHosts', ['openrouter.ai']),
  },
  diagnostics: {
    allowAdminDiagnostics: envBoolean('sails__generation_diagnostics_allowAdminDiagnostics', false),
  },
};

export function validateGenerationConfig(config: GenerationConfig): GenerationConfig {
  const fail = (message: string): never => {
    throw new Error(`Invalid generation configuration: ${message}`);
  };
  if (config.artifacts.diagnosticRetentionDays < 0 || config.artifacts.diagnosticRetentionDays > config.artifacts.maxDiagnosticRetentionDays) {
    fail(`diagnosticRetentionDays must be between 0 and ${config.artifacts.maxDiagnosticRetentionDays}`);
  }
  const positiveValues: Array<[string, number]> = [
    ['operationalExpiryMinutes', config.artifacts.operationalExpiryMinutes],
    ['provider.timeoutMs', config.provider.timeoutMs],
    ['provider.maxRequestBytes', config.provider.maxRequestBytes],
    ['provider.maxResponseBytes', config.provider.maxResponseBytes],
    ['context.maxTotalBytes', config.context.maxTotalBytes],
    ['context.maxFieldBytes', config.context.maxFieldBytes],
    ['context.maxKnowledgeChunks', config.context.maxKnowledgeChunks],
    ['context.maxChunkBytes', config.context.maxChunkBytes],
    ['queue.concurrency', config.queue.concurrency],
    ['queue.lockLifetimeMs', config.queue.lockLifetimeMs],
    ['limits.perUserConcurrentRuns', config.limits.perUserConcurrentRuns],
    ['limits.perBrandConcurrentRuns', config.limits.perBrandConcurrentRuns],
    ['limits.perUserDailyRuns', config.limits.perUserDailyRuns],
    ['limits.perBrandDailyRuns', config.limits.perBrandDailyRuns],
    ['polling.minMs', config.polling.minMs],
    ['polling.maxMs', config.polling.maxMs],
  ];
  for (const [name, value] of positiveValues) {
    if (!Number.isFinite(value) || value <= 0) {
      fail(`${name} must be positive`);
    }
  }
  if (!Number.isInteger(config.provider.maxRetries) || config.provider.maxRetries < 0) {
    fail('provider.maxRetries must be a non-negative integer');
  }
  if (config.context.maxFieldBytes > config.context.maxTotalBytes || config.context.maxChunkBytes > config.context.maxTotalBytes) {
    fail('individual context limits must not exceed context.maxTotalBytes');
  }
  if (config.polling.maxMs < config.polling.minMs) {
    fail('polling.maxMs must be greater than or equal to polling.minMs');
  }
  if (config.enabled && !config.artifacts.encryptionKeyRef.trim()) {
    fail('artifacts.encryptionKeyRef is required when generation is enabled');
  }
  if (!config.adapters.length) {
    fail('at least one adapter must be configured');
  }
  return config;
}

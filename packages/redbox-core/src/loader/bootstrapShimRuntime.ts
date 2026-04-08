import { promises as fs } from 'fs';
import path from 'path';

export interface GeneratedHookBootstrap {
    name: string;
    bootstrap: () => Promise<void>;
}

type BootstrapCallback = (error?: unknown) => void;

function serializeConfig(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
    }
    if (typeof value !== 'object') {
        return value;
    }
    if (seen.has(value as object)) {
        return '[Circular]';
    }
    seen.add(value as object);
    if (Array.isArray(value)) {
        return value.map(item => serializeConfig(item, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        result[key] = serializeConfig(item, seen);
    }
    return result;
}

async function exportPostBootstrapSnapshot(): Promise<void> {
    if (process.env.EXPORT_BOOTSTRAP_CONFIG_JSON !== 'true') {
        return;
    }

    const configSnapshot = {
        _meta: {
            exportedAt: new Date().toISOString(),
            stage: 'post-bootstrap',
            description: 'Final merged sails.config AFTER Sails loads environment config and runs bootstrap',
            environment: process.env.NODE_ENV || 'development'
        },
        ...(serializeConfig(sails.config) as Record<string, unknown>)
    };
    const debugDir = path.join(process.cwd(), 'support', 'debug-config');
    await fs.mkdir(debugDir, { recursive: true });
    const snapshotPath = path.join(debugDir, 'post-bootstrap-config.json');
    await fs.writeFile(snapshotPath, JSON.stringify(configSnapshot, null, 2));
    sails.log.info('Exported config snapshot to ' + snapshotPath);
}

export function createGeneratedBootstrap(
    preLiftSetup: () => void,
    coreBootstrap: () => Promise<void>,
    hookBootstraps: GeneratedHookBootstrap[]
): (cb: BootstrapCallback) => void {
    return function bootstrap(cb: BootstrapCallback): void {
        preLiftSetup();

        (async () => {
            await coreBootstrap();
            sails.log.verbose('Core bootstrap complete.');

            for (const hookBootstrap of hookBootstraps) {
                await hookBootstrap.bootstrap();
                sails.log.verbose(`Hook bootstrap complete: ${hookBootstrap.name}`);
            }

            await exportPostBootstrapSnapshot();
        })().then(() => {
            cb();
        }).catch(error => {
            sails.log.verbose('Bootstrap failed!!!');
            sails.log.error(error);
            cb(error);
        });
    };
}

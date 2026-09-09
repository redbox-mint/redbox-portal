#!/usr/bin/env node
import { Config } from './config/Config';
import { MetadataDiscoveryService } from './discovery/MetadataDiscoveryService';
import { DiscoveryEvent } from './discovery/types';
import { FigshareApiError, FigshareClient } from './figshare/FigshareClient';
import { MetadataNormaliser } from './normalisation/MetadataNormaliser';
import { CsvReporter } from './output/CsvReporter';
import { HtmlReporter } from './output/HtmlReporter';
import { JsonReporter } from './output/JsonReporter';

function eventMessage(event: DiscoveryEvent): string {
  switch (event.kind) {
    case 'core-fields':
      return `✓ CQU dataset core fields ${event.count}`;
    case 'institution-fields':
      return `✓ Institution custom fields ${event.count}`;
    case 'group-fields':
      return `✓ Group ${event.groupId} effective item fields ${event.count}`;
    case 'licenses':
      return `✓ Licences ${event.count}`;
    case 'categories':
      return `✓ Categories ${event.count}`;
  }
}

export async function run(args: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = Config.parse(args);
  if (parsed.help) {
    process.stdout.write(`${Config.helpText()}\n`);
    return;
  }
  const config = parsed.config!;
  process.stdout.write(`Connecting to Figshare at ${config.baseUrl}...\n\n`);
  const client = new FigshareClient({
    token: config.token,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxAttempts: config.maxAttempts,
  });
  const discoveryService = new MetadataDiscoveryService(client, {
    groupId: config.groupId,
    onEvent: event => process.stdout.write(`${eventMessage(event)}\n`),
  });
  const discovery = await discoveryService.discover();
  const jsonReporter = new JsonReporter();
  if (config.raw) {
    await jsonReporter.writeRaw(config.outputDirectory, discovery);
    process.stdout.write('\n✓ Raw API responses written\n');
  }
  if (!config.rawOnly) {
    const model = await new MetadataNormaliser(config.baseUrl).normalise(discovery);
    await Promise.all([
      jsonReporter.write(config.outputDirectory, model),
      jsonReporter.writeCrosswalk(config.outputDirectory, model),
      new CsvReporter().write(config.outputDirectory, model),
      new HtmlReporter().write(config.outputDirectory, model),
    ]);
    const inlineCount = model.itemTypes
      .flatMap(itemType => itemType.fields)
      .filter(field => field.valueSource === 'inline').length;
    process.stdout.write(`✓ Fields with inline controlled values ${inlineCount}\n`);
  }
  if (config.verbose && client.lastResponseMetadata != null) {
    const metadata = client.lastResponseMetadata;
    process.stdout.write(`\nLast response: HTTP ${metadata.statusCode} ${metadata.endpoint}\n`);
    if (metadata.rateLimit != null || metadata.rateLimitRemaining != null) {
      process.stdout.write(
        `Rate limit: ${metadata.rateLimitRemaining ?? '?'} remaining of ${metadata.rateLimit ?? '?'}\n`
      );
    }
  }
  process.stdout.write(`\nReports written to ${config.outputDirectory}\n`);
}

if (require.main === module) {
  run().catch((error: unknown) => {
    if (error instanceof FigshareApiError) {
      process.stderr.write(`${error.message}\n`);
      if (error.responseBody != null) {
        process.stderr.write(`${JSON.stringify(error.responseBody, null, 2)}\n`);
      }
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exitCode = 1;
  });
}

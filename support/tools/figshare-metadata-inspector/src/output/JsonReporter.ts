import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MetadataDiscoveryResult } from '../discovery/types';
import { FigshareMetadataModel } from '../normalisation/types';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function rawValues<T extends { raw: unknown }>(values: T[]): unknown[] {
  return values.map(value => value.raw);
}

export class JsonReporter {
  public async writeRaw(outputDirectory: string, discovery: MetadataDiscoveryResult): Promise<void> {
    const rawDirectory = path.join(outputDirectory, 'raw');
    await Promise.all([
      writeJson(path.join(rawDirectory, 'dataset-target.json'), discovery.target),
      writeJson(path.join(rawDirectory, 'core-fields.json'), discovery.raw.coreFields),
      writeJson(
        path.join(rawDirectory, 'institution-custom-fields.json'),
        rawValues(discovery.raw.institutionCustomFields)
      ),
      writeJson(
        path.join(rawDirectory, `group-${discovery.target.groupId}-item-metadata.json`),
        rawValues(discovery.raw.groupItemMetadata)
      ),
      writeJson(path.join(rawDirectory, 'licenses.json'), rawValues(discovery.raw.licenses)),
      writeJson(path.join(rawDirectory, 'categories.json'), rawValues(discovery.raw.categories)),
    ]);
  }

  public async write(outputDirectory: string, model: FigshareMetadataModel): Promise<void> {
    await writeJson(path.join(outputDirectory, 'figshare-schema.json'), model);
  }

  public async writeCrosswalk(outputDirectory: string, model: FigshareMetadataModel): Promise<void> {
    const crosswalk = {
      generatedAt: model.generatedAt,
      source: model.source,
      itemTypes: model.itemTypes.map(itemType => ({
        itemType: { id: itemType.id, name: itemType.name, groupId: itemType.groupId },
        mappings: itemType.fields.map(field => ({
          figshare: {
            fieldId: field.id,
            name: field.displayName ?? field.name,
            apiName: field.name,
            required: field.required,
            type: field.type,
            source: field.source,
            valueSource: field.valueSource,
            ...(field.values == null
              ? {}
              : {
                  values: field.values.map(value => ({
                    ...(value.id == null ? {} : { id: value.id }),
                    label: value.label ?? value.value,
                  })),
                }),
          },
          redbox: {
            field: null,
            ...(field.values == null ? {} : { valueMapping: {} }),
          },
        })),
      })),
    };
    await writeJson(path.join(outputDirectory, 'crosswalk-template.json'), crosswalk);
  }
}

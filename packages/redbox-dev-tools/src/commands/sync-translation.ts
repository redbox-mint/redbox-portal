import {Command, Option} from "commander";
import fs from 'node:fs/promises';
import path from "node:path";


const contentFormats = ["plain", "html"] as const;
type ContentFormats = typeof contentFormats[number];
type MetaEntryKey = string;
type MetaEntryValue = {
  category?: string,
  description?: string
  contentFormat?: ContentFormats,
};
export type MetaEntries = Record<MetaEntryKey, MetaEntryValue>;
export type MetaData = { source: string, data: MetaEntries };

export type TranslationLocaleRaw = { locale: string, source: string, data: Record<string, unknown> };
export type TranslationEntries = Record<string, string>;
export type TranslationLocaleEntries = Record<string, TranslationEntries>;

type ApiEntry = {
  key?: string,
  locale?: string,
  value?: string,
  uid?: string,
  branding?: string,
  bundle?: string,
  id?: string,
} & MetaEntryValue;


/**
 * Use a type predicate to narrow a string to a content format.
 * @param value The value to check.
 */
function isContentFormat(value: string | undefined): value is (ContentFormats | undefined) {
  return contentFormats.some(contentFormat => contentFormat === value);
}

/**
 * Build a path from a base path and additional parts.
 * @param basePath The base path.
 * @param parts The additional path parts.
 */
function buildPath(basePath: string, ...parts: string[]): string {
  if (!basePath.trim()) {
    throw new Error(`Invalid base path ${basePath}`);
  }

  const basePathResolved = path.resolve(basePath);
  const resolved = path.resolve(...[basePathResolved, ...parts]);

  // Ensure resolved path is inside basePath
  if (!resolved.startsWith(basePathResolved + path.sep) && resolved !== basePathResolved) {
    throw new Error(`Invalid path ${resolved}`);
  }

  return resolved
}

/**
 * Get the last non-empty string.
 * @param value The strings.
 */
function lastNonEmptyString(...value: unknown[]): string | undefined {
  for (let index = (value.length - 1); index >= 0; index--) {
    const item = value[index];
    if (typeof item === 'string' && item.length > 0) {
      return item;
    }
  }
  return undefined;
}

/**
 * Read the translation json files.
 * @param filesPath The path to the top directory containing the meta.json file.
 */
async function readTranslationFiles(filesPath: string): Promise<{
  meta: MetaData,
  locales: TranslationLocaleRaw[]
}> {
  // Read files
  const metaPath = buildPath(filesPath, 'meta.json');
  console.log(`Load translation meta file ${metaPath}`);
  const metaData: MetaEntries = JSON.parse(await fs.readFile(metaPath, {encoding: 'utf8'}));

  const localeNames: string[] = [];
        for (const dirent of await fs.readdir(filesPath, {withFileTypes: true})) {
    if (!dirent.isDirectory()) {
    continue;
          }
          const translationPath = path.resolve(langDefaultsPath, dirent.name, 'translation.json');
          try {
            const translationStat = await fs.stat(translationPath);
            if (translationStat.isFile()) {
              langDefaultsLocales.push(dirent.name);
            }
          } catch {
            // Nested folders such as language-defaults/demo are documentation
            // or sample data, not locale roots.
          }
        }
  const localeTranslationData: TranslationLocaleRaw[] = [];
  for (const locale of localeNames) {
    const p = buildPath(filesPath, locale, 'translation.json');
    const data = JSON.parse(await fs.readFile(p, {encoding: 'utf8'})) as Record<string, unknown>;
    console.log(`Load translation locale file ${p}`);
    localeTranslationData.push({locale, source: p, data});
  }

  return {
    meta: {
      source: metaPath,
      data: metaData,
    },
    locales: localeTranslationData,
  };
}

/**
 * Write updated translation json files.
 * @param opts The options.
 * @param opts.meta The meta details.
 * @param opts.locales The translation locale data.
 * @param opts.dryRun Whether this is a dry run.
 * @param opts.writePath The top-level path to write the output.
 */
async function writeTranslationFiles(opts: {
  meta: MetaEntries,
  locales: TranslationLocaleEntries,
  dryRun?: boolean,
  writePath: string,
}) {
  const metaPath = buildPath(opts?.writePath, 'meta.json');
  if (opts.dryRun) {
    console.log(`[dry-run] Not writing updated meta to ${metaPath}`);
  } else {
    // Write merged meta back to file
    console.log(`Writing updated meta to ${metaPath}`);
    await fs.mkdir(path.dirname(metaPath), {recursive: true});
    await fs.writeFile(metaPath, JSON.stringify(opts.meta, null, 2));
  }

  // Write translation files
  for (const [locale, data] of Object.entries(opts.locales)) {
    const translationPath = buildPath(opts?.writePath, locale, 'translation.json');
    if (opts.dryRun) {
      console.log(`[dry-run] Not writing updated translation data to ${translationPath}`);
    } else {
      console.log(`Writing updated translation data to ${translationPath}`);
      await fs.mkdir(path.dirname(translationPath), {recursive: true});
      await fs.writeFile(translationPath, JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Read translation data from ReDBox API.
 * @param apiBaseUrl The base url for the API calls.
 */
async function readTranslationApi(apiBaseUrl: string): Promise<{
  meta: MetaData,
  locales: TranslationLocaleRaw[]
}> {
  if (!apiBaseUrl.includes('://')) {
    throw new Error(`Api base url is not a valid url '${apiBaseUrl}'`);
  }
  if (!apiBaseUrl.endsWith('/')) {
    apiBaseUrl += '/';
  }
  const translationUrl = new URL('default/rdmp/locales/__locale__/translation.json', apiBaseUrl);
  const entriesUrl = new URL('default/rdmp/app/i18n/entries', apiBaseUrl);

  console.log(`Load translation entries url ${entriesUrl}`);
  const entriesResponse = await fetch(entriesUrl, {signal: AbortSignal.timeout(5000)});
  if (!entriesResponse.ok) {
    throw new Error(`Could not fetch translation entries: status ${entriesResponse.status} body ${await entriesResponse.text()}`);
  }
  const entriesData: ApiEntry[] = await entriesResponse.json();

  const metaData: MetaEntries = Object.create(null);
  const localeTranslationData: TranslationLocaleRaw[] = [];
  const localeNames: string[] = Array.from(new Set<string>(entriesData.map(e => e.locale).filter(l => typeof l === 'string'))).sort();
  for (const localeName of localeNames) {
    if (!localeName || !localeName.trim() || localeName.includes('.') || localeName.includes('/')) {
      console.warn(`Ignoring invalid locale name '${localeName}'.`);
      continue;
    }
    const translationLocaleUrl = new URL(translationUrl.toString().replace('/__locale__/', `/${encodeURIComponent(localeName)}/`));
    console.log(`Load translation locale url ${translationLocaleUrl}`);
    const translationResponse = await fetch(translationLocaleUrl, {signal: AbortSignal.timeout(5000)});
    if (!translationResponse.ok) {
      throw new Error(`Could not fetch translation locale: status ${translationResponse.status} body ${await translationResponse.text()}`);
    }
    localeTranslationData.push({
      locale: localeName,
      source: translationLocaleUrl.toString(),
      data: await translationResponse.json()
    });
  }

  for (const entryData of entriesData) {
    if (!entryData.key) {
      continue;
    }
    if (!(entryData.key in metaData)) {
      metaData[entryData.key] = Object.create(null);
    }

    if (entryData.category) {
      metaData[entryData.key].category = entryData.category;
    }
    if (entryData.contentFormat) {
      metaData[entryData.key].contentFormat = entryData.contentFormat;
    }
    if (entryData.description) {
      metaData[entryData.key].description = entryData.description;
    }
  }

  return {
    meta: {
      source: entriesUrl.toString(),
      data: metaData,
    },
    locales: localeTranslationData,
  };
}

/**
 * Merge two or more meta entries.
 * @param opts The merge options.
 * @param opts.key The translation key.
 * @param opts.value The translation value.
 * @param opts.items The meta entries.
 * @param opts.guessContentFormat Whether to guess the content format from the translation value.
 */
function mergeMetaItems(opts: {
  key?: string,
  value?: string,
  items: (MetaEntryValue | undefined)[],
  guessContentFormat?: boolean
}): MetaEntryValue {
  // content format
  const contentFormatRaw = lastNonEmptyString(
    ...opts.items?.map(i => i?.contentFormat)
  );
  let contentFormat: ContentFormats | undefined = isContentFormat(contentFormatRaw) ? contentFormatRaw : undefined;

  const isHtml = opts.guessContentFormat === true &&
    opts.value !== undefined &&
    contentFormat === undefined &&
    (typeof opts.value === 'string' && (
      opts.value?.includes('<') &&
      opts.value?.includes('</') &&
      opts.value?.includes('>')
    ));
  if (isHtml) {
    contentFormat = "html";
  }

  // description
  const description = lastNonEmptyString(
    ...[
      opts?.key === undefined ? "" : `Translation for ${opts.key}`,
      ...opts.items?.map(i => i?.description),
    ]
  );

  // category
  const keySplit = typeof opts.key === 'string' ? opts.key.split(/[_\-:.@]+/).filter(i => !!i) : [];
  const category = lastNonEmptyString(
    ...[
      keySplit.length > 0 ? keySplit[0] : undefined,
      ...opts.items?.map(i => i?.category),
    ]
  );

  const result = Object.create(null);
  result.category = category;
  result.description = description;
  result.contentFormat = contentFormat;
  return result;
}

type OptionCollected = { type: string, value: string };

export function registerSyncTranslationCommand(program: Command): void {
  const sourcesCollected: OptionCollected[] = [];
  program
    .command('sync-translation')
    .description('Read translations from API and/or json files, and write to language translation files.')
    .option(
      '-l, --language-defaults <path>',
      'Path to read the language-defaults directory containing locales and meta json files. Can be provided multiple times.',
      (value: string, previous: OptionCollected[]) => {
        previous.push({type: 'language-defaults', value});
        return previous;
      },
      sourcesCollected
    )
    .option(
      '-a, --api-base <url>',
      'Base url for the API to read translation data. Can be provided multiple times.',
      (value: string, previous: OptionCollected[]) => {
        previous.push({type: 'api-base', value});
        return previous;
      },
      sourcesCollected
    )
    .requiredOption('-o, --output <path>', 'Path to the output directory or file.')
    .addOption(
      new Option('-f, --format <format>', 'The output format.')
        .choices(['language-defaults'])
        .default('language-defaults')
    )
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const outputPath: string = options.output;
        const outputFormat: string = options.format;

        if (sourcesCollected.length === 0) {
          throw new Error(`Must provide at least one of language-defaults path or api-base url.`);
        }

        // Get existing translation data
        const sourceMeta: MetaData[] = [];
        const sourceTranslations: TranslationLocaleRaw[] = [];

        // Precedence order: later items overwrite earlier items.
        // Populate source meta and translations in order provided in command line.
        for (const {type, value} of sourcesCollected) {
          if (type === 'language-defaults') {
            const {meta, locales} = await readTranslationFiles(value);
            sourceMeta.push(meta);
            sourceTranslations.push(...locales);
          } else if (type === 'api-base') {
            const {meta, locales} = await readTranslationApi(value);
            sourceMeta.push(meta);
            sourceTranslations.push(...locales);
          } else {
            throw new Error(`Unknown source type '${type}'.`);
          }
        }

        // The keys for locales are the source of truth,
        // so any keys in meta that are not in any locale data will be dropped.
        const keys = new Set<string>(sourceTranslations.flatMap(i => Object.keys(i.data)));

        // The unique locale names.
        const localeNames = Array.from(
          new Set<string>(
            sourceTranslations.map(i => i.locale)
          )
        ).sort();

        // Gather translation and meta entries.
        const meta: MetaEntries = Object.create(null);
        const locales: TranslationLocaleEntries = Object.create(null);

        for (const key of keys) {
          if (!key) {
            continue;
          }
          for (const localeName of localeNames) {
            if (!localeName) {
              continue;
            }
            if (!(localeName in locales)) {
              locales[localeName] = Object.create(null);
            }
            const localeTranslationData = sourceTranslations.filter(i => i.locale === localeName);

            // Translation value for a locale key.
            const values = localeTranslationData
              .map(i => i.data?.[key])
              .filter(i => typeof i === 'string')
              .filter(i => i?.trim().length > 0);
            if (new Set<string>(values).size > 1) {
              console.warn(`Translation '${localeName}' key '${key}' has more than one value: ${JSON.stringify(values)}`);
            }

            const valuesNonString = localeTranslationData
              .map(i => i.data?.[key])
              .filter(i => typeof i !== 'string' && i !== undefined);
            if (valuesNonString.length > 0) {
              console.warn(`Translation '${localeName}' key '${key}' has non-string values that were ignored:`, valuesNonString);
            }

            const value = lastNonEmptyString(...values);
            locales[localeName][key] = value ?? "";

            // Meta details for a key.
            meta[key] = mergeMetaItems({
              key,
              value,
              items: [...sourceMeta.map(i => i.data?.[key]), meta[key]],
              guessContentFormat: true,
            }) ?? Object.create(null);
          }
        }

        // Write output
        if (outputFormat === "language-defaults") {
          await writeTranslationFiles({
            meta,
            locales,
            writePath: outputPath,
            dryRun: globalOptions.dryRun,
          });
        } else {
          throw new Error(`Unknown output format '${outputFormat}'`);
        }

        console.log(`\n🛠️  Ran sync-translation`);
        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}

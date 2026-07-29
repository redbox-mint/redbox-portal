import {Command} from "commander";
import fs from 'node:fs/promises';
import path from "node:path";

type MetaEntryKey = string;
const contentFormats = ["plain", "html"] as const;
type ContentFormats = typeof contentFormats[number];
type MetaEntryValue = {
  category?: string,
  description?: string
  contentFormat?: ContentFormats,
};
export type MetaEntries = Record<MetaEntryKey, MetaEntryValue>;

function isContentFormat(value: string | undefined): value is (ContentFormats | undefined) {
  return contentFormats.some(contentFormat => contentFormat === value);
}

function firstNonEmptyString(...value: unknown[]): string | undefined {
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) {
      return item;
    }
  }
  return undefined;
}

export function registerSyncTranslationCommand(program: Command): void {
  program
    .command('sync-translation')
    .description('Read translations from API and write to language defaults files.')
    .requiredOption('-l, --language-defaults <path>', 'Path to the language-defaults directory containing locales and meta json files.')
    .requiredOption('-a, --api-base <url>', 'Base url for the API to obtain translations.')
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const langDefaultsPath = path.resolve(options.languageDefaults);
        const apiBaseUrl = options.apiBase;

        if (!langDefaultsPath) {
          throw new Error(`Must provide language-defaults path.`);
        }
        if (!apiBaseUrl) {
          throw new Error(`Must provide api-base url.`);
        }

        // Read files
        const langDefaultsMetaPath = path.resolve(langDefaultsPath, 'meta.json');
        console.log(`Load translation meta file ${langDefaultsMetaPath}`);
        const langDefaultsMetaData: MetaEntries = JSON.parse(await fs.readFile(langDefaultsMetaPath, {encoding: 'utf8'}));

        const langDefaultsLocales: string[] = (await fs.readdir(langDefaultsPath, {withFileTypes: true}))
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        const langDefaultsLocaleTranslationData = [];
        for (const locale of langDefaultsLocales) {
          const p = path.resolve(langDefaultsPath, locale, 'translation.json');
          const data = JSON.parse(await fs.readFile(p, {encoding: 'utf8'}));
          console.log(`Load translation locale file ${p}`);
          langDefaultsLocaleTranslationData.push({locale, data});
        }

        // Read urls
        const translationUrl = new URL('/default/rdmp/locales/__locale__/translation.json', apiBaseUrl);
        const entriesUrl = new URL('/default/rdmp/app/i18n/entries', apiBaseUrl);

        console.log(`Load translation entries url ${entriesUrl}`);
        const entriesResponse = await fetch(entriesUrl, {signal: AbortSignal.timeout(5000)});
        if (!entriesResponse.ok) {
          throw new Error(`Could not fetch translation entries: status ${entriesResponse.status} body ${await entriesResponse.text()}`);
        }
        const entriesData: ({
          key?: string,
          locale?: string
        } & MetaEntryValue)[] = await entriesResponse.json();
        const translationData = [];
        for (const langDefaultsLocale of langDefaultsLocales) {
          const translationLocaleUrl = translationUrl.toString().replace('/__locale__/', `/${langDefaultsLocale}/`);
          console.log(`Load translation locale url ${translationLocaleUrl}`);
          const translationResponse = await fetch(translationLocaleUrl, {signal: AbortSignal.timeout(5000)});
          if (!translationResponse.ok) {
            throw new Error(`Could not fetch translation locale: status ${translationResponse.status} body ${await translationResponse.text()}`);
          }
          translationData.push({
            locale: langDefaultsLocale,
            data: await translationResponse.json()
          });
        }

        // Merge locale data
        // Maintain _meta in translation.json file, but don't update it from remote meta.
        const translationMerged: Record<string, Record<string, string>> = {};
        for (const {locale, data} of langDefaultsLocaleTranslationData) {
          if (locale in translationMerged) {
            throw new Error(`Duplicate locale ${locale}`);
          }
          const translationDataFromUrl = translationData.find(i => i.locale === locale) ?? {locale, data: {}};
          const dataOnlyStrings: Record<string, string> = {};
          for (const [key, value] of Object.entries(translationDataFromUrl.data)) {
            if (typeof value === 'string') {
              dataOnlyStrings[key] = value;
            } else {
              console.log(`Dropped key '${key}' with non-string value ${JSON.stringify(value)}`);
            }
          }

          const newData = {...data, ...dataOnlyStrings};
          if (globalOptions.dryRun) {
            const changes = Object.entries(newData)
              .filter(([key, value]) => data[key] !== value)
              .map(([key, value]) => [key, {'original': data[key], 'new': value}]);
            if (changes.length > 0) {
              console.log({locale, changes: Object.fromEntries(changes)});
            }
          }
          translationMerged[locale] = newData;
        }


        if (globalOptions.dryRun) {
          console.log('[dry-run] Translation data merged; no file written.');
        } else {
          // Write merged data back to locale file
          for (const [locale, data] of Object.entries(translationMerged)) {
            const p = path.resolve(langDefaultsPath, locale, 'translation.json');
            console.log(`Writing updated translation data to ${p}`);
            await fs.writeFile(p, JSON.stringify(data, null, 2));
          }
        }

        // Merge meta, in highest to lowest priority order:
        // remote meta, _meta key from the translation, existing meta entry.
        // Use a calculated value for description and category if they are not provided.
        const metaMerged: MetaEntries = {};
        for (const [locale, localeTranslation] of Object.entries(translationMerged)) {
          const entriesLocale = entriesData.filter(e => e.locale === locale);
          for (const key of Object.keys(localeTranslation)) {
            if (key === '_meta' || key.startsWith('_meta.')) {
              continue;
            }
            const entriesItems = entriesLocale.filter(e => e.key === key);
            const entriesItem = entriesItems.length > 0 ? entriesItems[0] : undefined;
            const translationItem = localeTranslation[key] ?? "";
            const translationMetaItem = ('_meta' in localeTranslation && localeTranslation['_meta'] !== null && typeof localeTranslation['_meta'] === 'object') ? (localeTranslation['_meta'] as Record<string, Record<string, unknown>>)[key] : undefined;
            const metaItem = langDefaultsMetaData[key];

            // Populate the meta data.
            const contentFormatRaw = firstNonEmptyString(
              entriesItem?.contentFormat, translationMetaItem?.contentFormat, metaItem?.contentFormat
            );
            let contentFormat: ContentFormats | undefined = isContentFormat(contentFormatRaw) ? contentFormatRaw : undefined;

            // Don't guess whether the translation value is html or plain, leave it as-is.

            const description = firstNonEmptyString(
              entriesItem?.description, translationMetaItem?.description, metaItem?.description,
              `Translation for ${key}`
            );

            const keySplit = key.split(/[_\-:.@]+/).filter(i => !!i);
            const category = firstNonEmptyString(
              entriesItem?.category, translationMetaItem?.category, metaItem?.category,
              keySplit.length > 0 ? keySplit[0] : undefined
            );

            const newItem: MetaEntryValue = {category, description, contentFormat};

            if (globalOptions.dryRun && JSON.stringify(metaItem) !== JSON.stringify(newItem)) {
              console.log({key, metaItem, translationItem, entriesItem, newItem});
            }
            if (Object.keys(newItem).length > 0 && Object.values(newItem).some(v => !!v)) {
              metaMerged[key] = newItem;
            }
          }
        }

        if (globalOptions.dryRun) {
          console.log('[dry-run] Meta merged; no file written. Changed entries printed above.');
        } else {
          // Write merged meta back to file
          console.log(`Writing updated meta to ${langDefaultsMetaPath}`);
          await fs.writeFile(langDefaultsMetaPath, JSON.stringify(metaMerged, null, 2));
        }
        console.log(`\n🛠️  Ran sync-translation`);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}

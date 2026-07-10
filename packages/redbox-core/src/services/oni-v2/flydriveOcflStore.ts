import { PassThrough, Readable, Writable } from 'node:stream';
import { posix as pathPosix, relative } from 'node:path';
import type { Services as StorageManagerServices } from '../StorageManagerService';

type OcflStoreConstructor = new (options: Record<string, unknown>) => object;

type StoreOptions = {
  disk: StorageManagerServices.IDisk;
  root: string;
  workspace: string;
  prefix?: string;
  keyEncoding?: 'flydrive' | 'raw';
};

type DiskEntry = {
  key?: string;
  prefix?: string;
  name?: string;
  isFile?: boolean;
  isDirectory?: boolean;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
};

type DirectoryEntryInfo = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
};

async function listDiskEntries(
  disk: StorageManagerServices.IDisk,
  prefix: string,
  options: { recursive: boolean }
): Promise<unknown[]> {
  const entries: unknown[] = [];
  let paginationToken: string | undefined;
  do {
    const listing = await disk.listAll(prefix, paginationToken ? { ...options, paginationToken } : options);
    entries.push(...listing.objects);
    paginationToken = listing.paginationToken;
  } while (paginationToken);
  return entries;
}

function normalizePrefix(prefix = ''): string {
  return String(prefix).replace(/^\/+|\/+$/g, '');
}

function encodeFlydriveKey(key: string): string {
  return key.replace(/%/g, '%25').replace(/=/g, '%3D');
}

function decodeFlydriveKey(key: string): string {
  return key.replace(/%3D/g, '=').replace(/%25/g, '%');
}

function normalizeKey(filePath: string, options: { preserveEquals?: boolean } = {}): string {
  const key = String(filePath).replace(/^\/+/, '');
  return options.preserveEquals === true ? key : encodeFlydriveKey(key);
}

function decodeKey(filePath: string, options: { preserveEquals?: boolean } = {}): string {
  return options.preserveEquals === true ? filePath : decodeFlydriveKey(filePath);
}

function withPrefix(prefix: string, filePath: string, options: { preserveEquals?: boolean } = {}): string {
  const key = normalizeKey(filePath, options);
  if (!prefix) {
    return key;
  }
  return key ? `${prefix}/${key}` : prefix;
}

function stripBasePath(basePath: string, filePath: string, options: { preserveEquals?: boolean } = {}): string {
  if (!basePath) {
    return normalizeKey(filePath, options);
  }
  const rel = relative(basePath, filePath);
  return rel === '' ? '' : rel;
}

function toError(code: string, filePath: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: ${filePath}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function isDiskEntry(value: unknown): value is DiskEntry {
  return value != null && typeof value === 'object';
}

function getEntryKey(value: unknown): string {
  if (!isDiskEntry(value)) {
    return '';
  }
  return String(value.key ?? value.prefix ?? '');
}

function isMissingDiskError(error: unknown): boolean {
  const code =
    error != null && typeof error === 'object' ? String((error as NodeJS.ErrnoException).code ?? '').toUpperCase() : '';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'ENOENT' ||
    code.includes('CANNOT_READ_FILE') ||
    code.includes('NOT_FOUND') ||
    message.includes('no such file') ||
    message.includes('not found') ||
    message.includes('cannot read file')
  );
}

export function createStorageManagerOcflStoreClass(OcflStore: OcflStoreConstructor) {
  return class StorageManagerOcflStore extends OcflStore {
    readonly prefix: string;
    readonly disk: StorageManagerServices.IDisk;
    readonly root: string;
    readonly workspace: string;
    readonly keyEncoding: 'flydrive' | 'raw';

    constructor(options: StoreOptions) {
      super(options as unknown as Record<string, unknown>);
      this.prefix = normalizePrefix(options.prefix);
      this.disk = options.disk;
      this.root = options.root;
      this.workspace = options.workspace;
      this.keyEncoding = options.keyEncoding ?? 'flydrive';
    }

    keyFor(filePath: string): string {
      const keyOptions = { preserveEquals: this.keyEncoding === 'raw' };
      const rootRel = stripBasePath(this.root, filePath, keyOptions);
      const workspaceRel = stripBasePath(this.workspace, filePath, keyOptions);
      if (filePath === this.root || rootRel === '') {
        return this.prefix;
      }
      if (filePath === this.workspace || workspaceRel === '') {
        return withPrefix(this.prefix, '__workspace__');
      }
      const rootKey = rootRel && !rootRel.startsWith('..');
      const workspaceKey = workspaceRel && !workspaceRel.startsWith('..');
      if (rootKey) {
        return withPrefix(this.prefix, rootRel, keyOptions);
      }
      if (workspaceKey) {
        return withPrefix(this.prefix, pathPosix.join('__workspace__', workspaceRel), keyOptions);
      }
      return withPrefix(this.prefix, normalizeKey(filePath, keyOptions), keyOptions);
    }

    async stat(filePath: string): Promise<{
      size: number;
      mtime: Date;
      atime: Date;
      ctime: Date;
      birthtime: Date;
      isFile: () => boolean;
      isDirectory: () => boolean;
    }> {
      const key = this.keyFor(filePath);
      try {
        const meta = await this.disk.getMetaData(key);
        const lastModified = meta.lastModified ?? new Date();
        return {
          size: meta.contentLength || 0,
          mtime: lastModified,
          atime: lastModified,
          ctime: lastModified,
          birthtime: lastModified,
          isFile: () => true,
          isDirectory: () => false,
        };
      } catch (error) {
        if (!isMissingDiskError(error)) {
          throw error;
        }
      }

      if (await this.hasDirectoryEntries(filePath)) {
        const now = new Date();
        return {
          size: 0,
          mtime: now,
          atime: now,
          ctime: now,
          birthtime: now,
          isFile: () => false,
          isDirectory: () => true,
        };
      }
      throw toError('ENOENT', filePath);
    }

    async createReadStream(filePath: string): Promise<NodeJS.ReadableStream> {
      return this.disk.getStream(this.keyFor(filePath));
    }

    async createWriteStream(filePath: string): Promise<NodeJS.WritableStream> {
      const key = this.keyFor(filePath);
      const uploadStream = new PassThrough();
      const upload = this.disk.putStream(key, uploadStream);
      const writable = new Writable({
        write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
          uploadStream.write(chunk, encoding, callback);
        },
        final(callback: (error?: Error | null) => void) {
          uploadStream.end();
          upload.then(
            () => callback(),
            error => callback(error instanceof Error ? error : new Error(String(error)))
          );
        },
        destroy(error: Error | null, callback: (error?: Error | null) => void) {
          uploadStream.destroy(error ?? undefined);
          callback(error);
        },
      });
      upload.catch(error => writable.destroy(error instanceof Error ? error : new Error(String(error))));
      return writable;
    }

    async createReadable(filePath: string): Promise<NodeJS.ReadableStream> {
      return this.createReadStream(filePath);
    }

    async createWritable(filePath: string): Promise<NodeJS.WritableStream> {
      return this.createWriteStream(filePath);
    }

    async readFile(
      filePath: string,
      options?: { encoding?: BufferEncoding } | BufferEncoding
    ): Promise<string | Uint8Array> {
      const key = this.keyFor(filePath);
      try {
        if (options === 'utf8' || (typeof options === 'object' && options?.encoding)) {
          return await this.disk.get(key);
        }
        return await this.disk.getBytes(key);
      } catch (error) {
        if (isMissingDiskError(error)) {
          throw toError('ENOENT', filePath);
        }
        throw error;
      }
    }

    async writeFile(
      filePath: string,
      data: string | Uint8Array | Readable,
      options?: Record<string, unknown>
    ): Promise<void> {
      const key = this.keyFor(filePath);
      if (data instanceof Readable) {
        await this.disk.putStream(key, data, options);
        return;
      }
      await this.disk.put(key, data, options);
    }

    async copyFile(source: string, target: string): Promise<void> {
      await this.disk.copy(this.keyFor(source), this.keyFor(target));
    }

    async opendir(filePath: string): Promise<{
      path: string;
      read: () => Promise<{ name: string; isDirectory: () => boolean; isFile: () => boolean } | null>;
      close: () => Promise<void>;
    }> {
      const entries = await this.readDirectoryEntries(filePath);
      let index = 0;
      return {
        path: filePath,
        async read() {
          const entry = entries[index++];
          if (!entry) {
            return null;
          }
          return {
            name: entry.name,
            isDirectory: () => entry.isDirectory,
            isFile: () => entry.isFile,
          };
        },
        async close() {},
      };
    }

    async hasDirectoryEntries(filePath: string): Promise<boolean> {
      const prefix = this.keyFor(filePath);
      const directoryPrefix = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
      const listing = await this.disk.listAll(directoryPrefix, { recursive: false });
      for (const item of listing.objects) {
        if (getEntryKey(item)) {
          return true;
        }
      }
      return false;
    }

    async readDirectoryEntries(filePath: string): Promise<DirectoryEntryInfo[]> {
      const keyOptions = { preserveEquals: this.keyEncoding === 'raw' };
      const prefix = this.keyFor(filePath);
      const directoryPrefix = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
      const entries = await listDiskEntries(this.disk, directoryPrefix, { recursive: false });
      const names = new Map<string, DirectoryEntryInfo>();
      for (const item of entries) {
        const key = getEntryKey(item);
        if (!key) {
          continue;
        }
        const rel = key.startsWith(directoryPrefix) ? key.slice(directoryPrefix.length) : key;
        const decodedRel = decodeKey(rel, keyOptions);
        const slashIndex = decodedRel.indexOf('/');
        const name = slashIndex === -1 ? decodedRel : decodedRel.slice(0, slashIndex);
        if (!name) {
          continue;
        }
        const diskEntry = isDiskEntry(item) ? item : {};
        const isDirectory = diskEntry.isDirectory === true || decodedRel.endsWith('/') || slashIndex !== -1;
        const isFile = diskEntry.isFile === true || !isDirectory;
        const existing = names.get(name);
        names.set(name, {
          name,
          isDirectory: (existing?.isDirectory ?? false) || isDirectory,
          isFile: (existing?.isFile ?? false) || isFile,
        });
      }
      return [...names.values()];
    }

    async readdir(filePath: string): Promise<string[]> {
      return (await this.readDirectoryEntries(filePath)).map(entry => entry.name);
    }

    async list(
      dirPath: string,
      { recursive = false }: { recursive?: boolean } = {}
    ): Promise<
      AsyncGenerator<{
        name: string;
        path: string;
        size: number;
        lastModified: Date;
      }>
    > {
      const keyOptions = { preserveEquals: this.keyEncoding === 'raw' };
      const prefix = this.keyFor(dirPath);
      const directoryPrefix = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
      const entries = await listDiskEntries(this.disk, directoryPrefix, { recursive });
      async function* iterator() {
        for (const item of entries) {
          const key = getEntryKey(item);
          if (!key || key.endsWith('/')) {
            continue;
          }
          const rel = key.startsWith(directoryPrefix) ? key.slice(directoryPrefix.length) : key;
          const decodedRel = decodeKey(rel, keyOptions);
          const entry = isDiskEntry(item) ? item : {};
          yield {
            name: pathPosix.basename(decodedRel),
            path: decodedRel,
            size: entry.contentLength ?? 0,
            lastModified: entry.lastModified ?? new Date(),
          };
        }
      }
      return iterator();
    }

    async mkdir(filePath: string): Promise<string> {
      return filePath;
    }

    async move(source: string, target: string): Promise<void> {
      const sourceKey = this.keyFor(source);
      const targetKey = this.keyFor(target);
      if (await this.disk.exists(sourceKey)) {
        await this.disk.move(sourceKey, targetKey);
        return;
      }

      const directoryPrefix = sourceKey ? `${sourceKey.replace(/\/+$/, '')}/` : '';
      const items = await listDiskEntries(this.disk, directoryPrefix, { recursive: true });
      if (items.length === 0) {
        throw toError('ENOENT', source);
      }
      for (const item of items) {
        const key = getEntryKey(item);
        if (!key) {
          continue;
        }
        const rel = key.startsWith(directoryPrefix) ? key.slice(directoryPrefix.length) : key;
        if (directoryPrefix && !key.startsWith(directoryPrefix)) {
          continue;
        }
        await this.disk.move(key, rel ? `${targetKey}/${rel}` : targetKey);
      }
    }

    async remove(filePath: string): Promise<void> {
      const key = this.keyFor(filePath);
      if (await this.disk.exists(key)) {
        await this.disk.delete(key);
        return;
      }
      await this.disk.deleteAll(key ? `${key}/` : '');
    }
  };
}

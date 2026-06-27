import { PassThrough, Readable } from 'node:stream';
import { posix as pathPosix, relative } from 'node:path';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { StorageDiskLike } from './types';

type OcflStoreConstructor = new (options: Record<string, unknown>) => object;

type StoreOptions = {
  disk: StorageDiskLike;
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

function toNodeReadable(data: unknown): NodeJS.ReadableStream {
  if (data != null && typeof data === 'object' && typeof (data as { pipe?: unknown }).pipe === 'function') {
    return data as NodeJS.ReadableStream;
  }
  if (data != null && typeof data === 'object' && typeof (data as { getReader?: unknown }).getReader === 'function') {
    return Readable.fromWeb(data as NodeReadableStream);
  }
  return data == null ? Readable.from([]) : Readable.from([data as Uint8Array | string]);
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

export function createStorageManagerOcflStoreClass(OcflStore: OcflStoreConstructor) {
  return class StorageManagerOcflStore extends OcflStore {
    readonly prefix: string;
    readonly disk: StorageDiskLike;
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

    baseKeyFor(filePath: string): string {
      return this.keyFor(filePath).replace(/^.*?\//, '');
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
      if (await this.disk.exists(key)) {
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
      }

      const dirEntries = await this.readdir(filePath).catch(() => []);
      if (dirEntries.length > 0) {
        return {
          size: 0,
          mtime: new Date(),
          atime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
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
      const stream = new PassThrough();
      this.disk.putStream(key, stream).catch(error => stream.destroy(error));
      return stream;
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
        const code = String((error as NodeJS.ErrnoException).code ?? '');
        if (code.includes('E_CANNOT_READ_FILE')) {
          throw toError('ENOENT', filePath);
        }
        throw error;
      }
    }

    async writeFile(
      filePath: string,
      data: string | Uint8Array | NodeJS.ReadableStream,
      options?: Record<string, unknown>
    ): Promise<void> {
      const key = this.keyFor(filePath);
      if (data != null && typeof data === 'object' && typeof (data as { pipe?: unknown }).pipe === 'function') {
        await this.disk.putStream(key, data as NodeJS.ReadableStream, options);
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
      const entries = await this.readdir(filePath);
      let index = 0;
      const store = this;
      return {
        path: filePath,
        async read() {
          const name = entries[index++];
          if (!name) {
            return null;
          }
          const entryPath = pathPosix.join(filePath, name);
          const stat = await store.stat(entryPath).catch(() => null);
          return {
            name,
            isDirectory: () => stat?.isDirectory() ?? false,
            isFile: () => stat?.isFile() ?? false,
          };
        },
        async close() {},
      };
    }

    async readdir(filePath: string): Promise<string[]> {
      const keyOptions = { preserveEquals: this.keyEncoding === 'raw' };
      const prefix = this.keyFor(filePath);
      const directoryPrefix = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
      const listing = await this.disk.listAll(directoryPrefix, { recursive: false });
      const names = new Set<string>();
      for (const item of listing.objects) {
        const key = getEntryKey(item);
        if (!key) {
          continue;
        }
        const rel = key.startsWith(directoryPrefix) ? key.slice(directoryPrefix.length) : key;
        const name = decodeKey(rel, keyOptions).split('/')[0];
        if (name) {
          names.add(name);
        }
      }
      return [...names];
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
      const listing = await this.disk.listAll(directoryPrefix, { recursive });
      async function* iterator() {
        for (const item of listing.objects) {
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
      const listing = await this.disk.listAll(directoryPrefix, { recursive: true });
      const items = [...listing.objects];
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

export function streamFromValue(data: string | Uint8Array | NodeJS.ReadableStream): NodeJS.ReadableStream {
  return toNodeReadable(data);
}

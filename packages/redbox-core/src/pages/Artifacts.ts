import { existsSync, realpathSync, statSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import ejs from 'ejs';

/** Installed, ordered roots supplied by extension resolution and the application artifact. */
export class PageArtifacts {
  private preparedViews?: string;
  private preparation?: Promise<void>;
  public initialize(): Promise<void> {
    return (this.preparation ??= this.prepare());
  }
  private async prepare(): Promise<void> {
    const directory = await mkdtemp(path.join(tmpdir(), 'redbox-page-views-'));
    try {
      for (const root of [...this.views].reverse())
        await cp(root, directory, {
          recursive: true,
          dereference: true,
          filter: source => {
            const relative = path.relative(root, source);
            return (
              !relative.split(path.sep).some(segment => segment.startsWith('.')) &&
              (source === root || realpathSync(source).startsWith(realpathSync(root) + path.sep))
            );
          },
        });
      this.preparedViews = directory;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  public async close(): Promise<void> {
    await this.preparation;
    if (this.preparedViews) await rm(this.preparedViews, { recursive: true, force: true });
    this.preparedViews = undefined;
  }
  public static installed(directory: string): PageArtifacts {
    return new PageArtifacts([path.join(directory, 'views')], [path.join(directory, 'assets')]);
  }
  public constructor(
    public readonly views: readonly string[],
    public readonly assets: readonly string[]
  ) {
    if (!views.length || !assets.length) throw new TypeError('Page artifacts require explicit view and asset roots.');
    for (const root of [...views, ...assets])
      if (!path.isAbsolute(root) || !statSync(root).isDirectory()) throw new TypeError('Invalid page artifact root.');
  }

  public find(roots: readonly string[], name: string): string | undefined {
    if (!name || name.includes('\\') || name.includes('\0') || name.split('/').some(p => p.startsWith('.')))
      return undefined;
    for (const root of roots) {
      const file = path.resolve(root, name);
      if (!file.startsWith(path.resolve(root) + path.sep) || !existsSync(file) || !statSync(file).isFile()) continue;
      // Packages can contain symlinks, but they cannot expose files outside their declared root.
      if (realpathSync(file).startsWith(realpathSync(root) + path.sep)) return file;
    }
    return undefined;
  }

  public view(name: string, brand: string, portal: string): string | undefined {
    const suffix = name.endsWith('.ejs') ? name : name + '.ejs';
    return [`${brand}/${portal}/${suffix}`, `default/${portal}/${suffix}`, `default/default/${suffix}`, suffix]
      .map(candidate => this.find(this.views, candidate))
      .find(Boolean);
  }

  public layout(brand: string, portal: string): string | undefined {
    return [
      `${brand}/_layouts/default.ejs`,
      'default/_layouts/default.ejs',
      `${brand}/${portal}/layout/layout.ejs`,
      `default/${portal}/layout.ejs`,
      'default/default/layout.ejs',
      'layout.ejs',
    ]
      .map(candidate => this.find(this.views, candidate))
      .find(Boolean);
  }

  public render(file: string, locals: Record<string, unknown>): string {
    const parentRoot = this.views.find(root => file.startsWith(root + path.sep));
    if (!parentRoot || !this.preparedViews) throw new Error('Initialize the declared page artifacts before rendering.');
    const filename = this.find([this.preparedViews], path.relative(parentRoot, file));
    if (!filename) throw new Error('Page artifact missing.');
    return ejs.render(readFileSync(filename, 'utf8'), locals, {
      filename,
      root: this.preparedViews,
      includer: (_name: string, parsed?: string) => {
        const include = parsed && this.find([this.preparedViews!], path.relative(this.preparedViews!, parsed));
        if (!include) throw new Error('Page include artifact missing.');
        return { filename: include };
      },
    });
  }

  public bundleHash(app: string, prefix: string, before = '', after = '', evenEmpty = false): string {
    if (![app, prefix].every(value => /^[A-Za-z0-9_-]+$/.test(value))) return '';
    for (const root of this.assets) {
      const directory = path.join(root, 'angular', app, 'browser');
      if (!existsSync(directory)) continue;
      const match = readdirSync(directory)
        .map(file => new RegExp('^' + prefix + '-([A-Za-z0-9_-]+)\\.(?:js|css)$').exec(file))
        .find(Boolean);
      if (match) return before + match[1] + after;
    }
    return evenEmpty ? before + after : '';
  }
}

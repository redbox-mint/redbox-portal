import UrlPattern from 'url-pattern';

export interface PathRule {
  readonly path?: string;
  readonly role: string | number | { readonly id?: string | number };
  readonly branding: string | number | { readonly id?: string | number; readonly name?: string };
  readonly can_read?: boolean;
  readonly can_update?: boolean;
}
export interface RuleRole {
  readonly id?: string | number;
}

function identifier(value: PathRule['role']): string | undefined {
  const id = typeof value === 'object' ? value?.id : value;
  return id === undefined ? undefined : String(id);
}
function normalizePath(path: string): string {
  return (path.length > 1 ? path.replace(/\/$/, '') : path).toLowerCase();
}

/** Application-owned snapshot. Bootstrap and explicit loadRules refresh it, never a request. */
export class PathRules {
  private patterns: readonly { pattern: UrlPattern; rule: PathRule }[] = [];
  private loaded = false;
  private loading?: Promise<PathRule[]>;

  public constructor(private readonly read: () => Promise<PathRule[]>) {}

  public loadRules(): Promise<PathRule[]> {
    if (this.loading) return this.loading;
    const work = Promise.resolve().then(async () => {
      const rules = await this.read();
      // Replace atomically: a failed read/pattern compile preserves the previous snapshot.
      const patterns = rules.map(rule => ({ pattern: new UrlPattern(normalizePath(rule.path ?? '')), rule }));
      this.patterns = patterns;
      this.loaded = true;
      return rules;
    });
    this.loading = work;
    void work.then(
      () => {
        this.loading = undefined;
      },
      () => {
        this.loading = undefined;
      }
    );
    return work;
  }

  public getRulesFromPath(path: string, brand: { readonly id?: string }): PathRule[] | null {
    if (!this.loaded) throw new Error('Initialize path rules before serving requests.');
    const normalized = normalizePath(path);
    const matched = this.patterns
      .filter(item => identifier(item.rule.branding) === brand.id && item.pattern.match(normalized) !== null)
      .map(item => item.rule);
    return matched.length ? matched : null;
  }

  public canRead(rules: readonly PathRule[], roles: readonly RuleRole[], brandName: string): boolean {
    return rules.some(
      rule =>
        typeof rule.branding === 'object' &&
        rule.branding.name === brandName &&
        roles.some(role => role.id === identifier(rule.role)) &&
        (rule.can_read === true || rule.can_update === true)
    );
  }

  public canWrite(rules: readonly PathRule[], roles: readonly RuleRole[], brandName: string): boolean {
    return this.canRead(
      rules.filter(rule => rule.can_update === true),
      roles,
      brandName
    );
  }
}

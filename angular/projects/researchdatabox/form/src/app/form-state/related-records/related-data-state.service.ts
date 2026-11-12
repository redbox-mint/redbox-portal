import { Injectable, signal } from '@angular/core';
import { RelatedMetadataEntry } from '@researchdatabox/sails-ng-common';

/** Owned by one form, including synchronous registration of downstream async work. */
@Injectable()
export class RelatedDataStateService {
  private readonly pending = signal(0);
  private readonly sources = signal(new Map<string, boolean>());

  get state(): 'pending' | 'ready' | 'error' {
    if (this.pending()) return 'pending';
    return [...this.sources().values()].some(Boolean) ? 'error' : 'ready';
  }

  begin(): () => void {
    this.pending.update(value => value + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.pending.update(value => value - 1);
    };
  }

  hasSource(source: string): boolean {
    return this.sources().has(source);
  }

  result(source: string, required: boolean, result?: RelatedMetadataEntry): void {
    this.sources.update(current => {
      const next = new Map(current);
      next.set(source, required && !!result && (result.status !== 'resolved' || !result.records.length));
      return next;
    });
  }

  remove(source: string): void {
    this.sources.update(current => {
      const next = new Map(current);
      next.delete(source);
      return next;
    });
  }
}

/** Tokens belong to a binding/pipeline owner and cover its awaited work. */
export class RelatedDataWorkScope {
  private readonly releases = new Set<() => void>();

  begin(tracker?: Pick<RelatedDataStateService, 'begin'>): () => void {
    const finish = tracker?.begin();
    const release = () => {
      if (!this.releases.delete(release)) return;
      finish?.();
    };
    this.releases.add(release);
    return release;
  }

  cancel(): void {
    for (const release of this.releases) release();
  }
}

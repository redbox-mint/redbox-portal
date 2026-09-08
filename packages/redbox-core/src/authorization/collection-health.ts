import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface CollectionHealthSnapshot {
  readonly bootId: string;
  readonly startedAt: string;
  readonly state: 'unknown' | 'healthy' | 'failed';
  readonly durable: boolean;
  readonly evidenceGap: boolean;
  readonly failures: number;
  readonly recoveries: number;
  readonly lastGapAt: string;
  readonly recoveredAt?: string;
  readonly checkedAt: string;
}

/** One private, persistent-volume file per serving process. No request data is stored. */
export class AuthorizationCollectionHealth {
  private readonly bootId = randomUUID();
  private readonly startedAt: string;
  private state: CollectionHealthSnapshot['state'] = 'unknown';
  private durable = false;
  private failures = 0;
  private recoveries = 0;
  private lastGapAt: string;
  private recoveredAt?: string;
  private initialized = false;

  public constructor(
    private readonly file: string | undefined = process.env.AUTHORIZATION_COLLECTION_HEALTH_FILE,
    private readonly now: () => Date = () => new Date()
  ) {
    this.startedAt = now().toISOString();
    this.lastGapAt = this.startedAt;
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.file) return;
    try {
      const prior: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (typeof prior !== 'object' || prior === null) return;
      const failures = Reflect.get(prior, 'failures');
      const recoveries = Reflect.get(prior, 'recoveries');
      const gap = Reflect.get(prior, 'lastGapAt');
      if (!Number.isSafeInteger(failures) || failures < 0 || !Number.isSafeInteger(recoveries) || recoveries < 0)
        return;
      if (typeof gap !== 'string' || !Number.isFinite(Date.parse(gap)) || Date.parse(gap) > this.now().getTime())
        return;
      this.failures = failures;
      this.recoveries = recoveries;
      // A new boot is an evidence gap even after a previously healthy shutdown.
      // Keep the counters; never infer continuity from a fresh in-memory object.
    } catch {
      // Missing/corrupt/unreadable state stays unknown until an actual successful collection.
    }
  }

  private persist(): void {
    this.durable = false;
    if (!this.file) return;
    let descriptor: number | undefined;
    try {
      const temporary = `${this.file}.${this.bootId}.tmp`;
      descriptor = openSync(temporary, 'w', 0o600);
      writeFileSync(descriptor, JSON.stringify(this.snapshot()));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, this.file);
      descriptor = openSync(dirname(this.file), 'r');
      fsyncSync(descriptor);
      this.durable = true;
    } catch {
      // Persistence is evidence only; authorization must continue unchanged.
    } finally {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          /* Evidence remains unavailable. */
        }
      }
    }
  }

  public observe(success: boolean): 'failed' | 'recovered' | undefined {
    this.initialize();
    const previous = this.state;
    this.state = success ? 'healthy' : 'failed';
    if (!success) {
      this.failures += 1;
      this.lastGapAt = this.now().toISOString();
    } else if (previous !== 'healthy') {
      this.recoveries += 1;
      this.recoveredAt = this.now().toISOString();
    }
    this.persist();
    if (!this.durable) {
      this.state = 'failed';
      this.lastGapAt = this.now().toISOString();
      if (success) this.failures += 1;
      return previous !== 'failed' ? 'failed' : undefined;
    }
    return !success && previous !== 'failed' ? 'failed' : success && previous !== 'healthy' ? 'recovered' : undefined;
  }

  /** Read-only: does not probe a write, clear a gap, or refresh collection success. */
  public snapshot(): CollectionHealthSnapshot {
    this.initialize();
    return Object.freeze({
      bootId: this.bootId,
      startedAt: this.startedAt,
      state: this.state,
      durable: this.durable,
      evidenceGap: this.state !== 'healthy' || !this.durable,
      failures: this.failures,
      recoveries: this.recoveries,
      lastGapAt: this.lastGapAt,
      ...(this.recoveredAt === undefined ? {} : { recoveredAt: this.recoveredAt }),
      checkedAt: this.now().toISOString(),
    });
  }
}

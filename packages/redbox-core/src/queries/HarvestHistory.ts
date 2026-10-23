import _ from 'lodash';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type {
  HarvestRunListQuery,
  HarvestRunListResult,
  HarvestRunDetailResult,
  HarvestRunEventsQuery,
  HarvestRunEventsResult,
} from '../model/storage/HarvestRunModel';
import type {
  HarvestRepositories,
  HarvestRunRow,
  HarvestRunFilter,
  HarvestEventFilter,
} from '../persistence/harvest/HarvestRepositories';
import { toRunModel, toChunkModel, toEventModel } from './harvestModels';
export class HarvestHistory {
  public constructor(
    private readonly repository: {
      runs: Pick<HarvestRepositories['runs'], 'countRuns' | 'listRuns' | 'findRun'>;
      chunks: Pick<HarvestRepositories['chunks'], 'listForRun'>;
      events: Pick<HarvestRepositories['events'], 'countEvents' | 'listEvents'>;
    }
  ) {}
  private resolveBrandId(brand: BrandingModel | string): string {
    if (typeof brand === 'string') {
      return brand.trim();
    }
    return String(brand?.id ?? brand?.name ?? '').trim();
  }
  private parsePositiveInt(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
  public async listRuns(brand: BrandingModel, params: Partial<HarvestRunListQuery>): Promise<HarvestRunListResult> {
    const brandId = this.resolveBrandId(brand);
    const page = this.parsePositiveInt(params.page, 1);
    const pageSize = Math.min(100, this.parsePositiveInt(params.pageSize, 20));
    const skip = (page - 1) * pageSize;
    const where: HarvestRunFilter = { brandId };
    if (!_.isEmpty(params.status)) {
      where.status = String(params.status);
    }
    if (!_.isEmpty(params.recordType)) {
      where.recordType = String(params.recordType);
    }
    if (!_.isEmpty(params.sourceName)) {
      where.sourceName = String(params.sourceName);
    }
    const startedAtFilters: NonNullable<HarvestRunFilter['startedAt']> = {};
    if (params.dateFrom instanceof Date && !Number.isNaN(params.dateFrom.getTime())) {
      startedAtFilters['>='] = params.dateFrom.toISOString();
    }
    if (params.dateTo instanceof Date && !Number.isNaN(params.dateTo.getTime())) {
      startedAtFilters['<='] = params.dateTo.toISOString();
    }
    if (!_.isEmpty(startedAtFilters)) {
      where.startedAt = startedAtFilters;
    }

    const total = await this.repository.runs.countRuns(where);
    const rows = (await this.repository.runs.listRuns(where, skip, pageSize)) as HarvestRunRow[];
    return {
      rows: rows.map(row => toRunModel(row)),
      total: Number(total ?? 0),
    };
  }

  public async getRun(brand: BrandingModel, runId: string): Promise<HarvestRunDetailResult | null> {
    const brandId = this.resolveBrandId(brand);
    const run = (await this.repository.runs.findRun({ id: runId, brandId })) as HarvestRunRow | null;
    if (!run) {
      return null;
    }

    const chunks = await this.repository.chunks.listForRun(runId, brandId, 100);
    const events = await this.repository.events.listEvents({ runId, brandId }, 0, 20);
    return {
      run: toRunModel(run),
      chunks: chunks.map(row => toChunkModel(row)),
      events: events.map(row => toEventModel(row)),
      aggregateCounts: {
        totalProcessed: Number(run.totalProcessed ?? 0),
        created: Number(run.created ?? 0),
        updated: Number(run.updated ?? 0),
        deleted: Number(run.deleted ?? 0),
        unchanged: Number(run.unchanged ?? 0),
        failed: Number(run.failed ?? 0),
        chunksProcessed: Number(run.chunksProcessed ?? 0),
        duplicateChunks: Number(run.duplicateChunks ?? 0),
      },
    };
  }

  public async runExists(brand: BrandingModel, runId: string): Promise<boolean> {
    const brandId = this.resolveBrandId(brand);
    const run = (await this.repository.runs.findRun({ id: runId, brandId })) as HarvestRunRow | null;
    return !_.isNil(run);
  }

  public async listRunEvents(
    brand: BrandingModel,
    runId: string,
    params: Partial<HarvestRunEventsQuery>
  ): Promise<HarvestRunEventsResult> {
    const brandId = this.resolveBrandId(brand);
    const page = this.parsePositiveInt(params.page, 1);
    const pageSize = Math.min(100, this.parsePositiveInt(params.pageSize, 20));
    const skip = (page - 1) * pageSize;
    const where: HarvestEventFilter = {
      runId,
      brandId,
    };
    if (!_.isEmpty(params.outcome)) {
      where.outcome = String(params.outcome);
    }
    if (!_.isEmpty(params.operation)) {
      where.operation = String(params.operation);
    }
    if (!_.isEmpty(params.harvestId)) {
      where.harvestId = String(params.harvestId);
    }
    if (!_.isEmpty(params.oid)) {
      where.oid = String(params.oid);
    }

    const total = await this.repository.events.countEvents(where);
    const rows = await this.repository.events.listEvents(where, skip, pageSize);
    return {
      rows: rows.map(row => toEventModel(row)),
      total: Number(total ?? 0),
    };
  }
}

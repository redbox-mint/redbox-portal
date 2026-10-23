import { createFigshareContext } from '../../integrations/figshare/context';
import { createFigshareBindings } from '../../integrations/figshare/bindings';
import { createFigshareMetadata } from '../../integrations/figshare/metadata';
import { createFigshareEmbargo } from '../../integrations/figshare/embargo';
import { createFigshareAssets } from '../../integrations/figshare/assets';
import type { DatastreamService } from '../../DatastreamService';
import type { FigshareLicense } from '../../services/figshare-v2/types';
import * as config from '../../services/figshare-v2/config';
import * as bindings from '../../services/figshare-v2/bindings';
import * as context from '../../services/figshare-v2/context';

const comparisonLicenses = new Map<string, FigshareLicense[]>();

export function comparisonFigshareContext() {
  return createFigshareContext({
    brandName: record => config.getBrandName(record),
    branding: {
      getBrandById: id => (typeof BrandingService === 'undefined' ? undefined : BrandingService.getBrandById?.(id)),
      getBrand: name => (typeof BrandingService === 'undefined' ? undefined : BrandingService.getBrand?.(name)),
    },
  });
}

export function comparisonFigshareBindings() {
  return createFigshareBindings({
    crosswalk: typeof FigshareVocabularyService === 'undefined' ? {} : FigshareVocabularyService,
    get log() {
      return sails.log;
    },
  });
}

function mappingInput() {
  return {
    bindings,
    bindingContext: context.createBindingContext,
    licenseCache: comparisonLicenses,
    get log() {
      return sails.log;
    },
  };
}

export const comparisonFigshareMetadata = () => createFigshareMetadata(mappingInput());
export const comparisonFigshareEmbargo = () => createFigshareEmbargo(mappingInput());

export function comparisonFigshareAssets() {
  return createFigshareAssets({
    datastream: () => {
      const name = sails.config.record?.datastreamService;
      const selected = name ? sails.services[name] : undefined;
      if (!selected || typeof selected.getDatastream !== 'function') return undefined;
      return selected as unknown as Pick<DatastreamService, 'getDatastream' | 'getDatastreamFingerprint'>;
    },
    get disks() {
      return StorageManagerService;
    },
    get log() {
      return sails.log;
    },
  });
}

import * as _ from 'lodash';
import {
  BrandingModel,
} from '../model';
import { Services as services } from '../CoreService';
import {
  CheckboxTreeComponentName,
  CheckboxTreeFieldComponentConfigOutline,
  FormConfigOutline,
  FormPrehydratePayload,
  FormPrehydrateRootKey,
  FormPrehydrateVocabTreePayload,
  VocabTreeChildrenResponse,
} from '@researchdatabox/sails-ng-common';

type AnyRecord = Record<string, unknown>;

type CheckboxTreeTarget = {
  vocabRef: string;
  selectedValues: Array<{
    notation: string;
    genealogy?: string[];
  }>;
};

type BuildInput = {
  branding: BrandingModel | string;
  formConfig: FormConfigOutline;
};

type PrehydrateConfig = {
  enabled: boolean;
  maxVocabSelections: number;
};

export namespace Services {
  export class FormPayloadPrehydrateService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'build',
      'extractTargets',
      'resolveVocabTrees'
    ];

    public async build({ branding, formConfig }: BuildInput): Promise<FormPrehydratePayload | undefined> {
      const config = this.getPrehydrateConfig();
      if (!config.enabled) {
        return undefined;
      }

      const checkboxTrees = this.extractTargets(formConfig, config);
      if (checkboxTrees.length === 0) {
        return undefined;
      }

      try {
        const vocabTrees = await this.resolveVocabTrees(branding, checkboxTrees);
        return _.isEmpty(vocabTrees) ? undefined : { vocabTrees };
      } catch (error) {
        this.logger.warn('Failed to build form prehydrate payload', error);
        return undefined;
      }
    }

    public extractTargets(formConfig: FormConfigOutline, config = this.getPrehydrateConfig()): CheckboxTreeTarget[] {
      const checkboxTrees: CheckboxTreeTarget[] = [];
      const componentDefinitions = Array.isArray(formConfig?.componentDefinitions) ? formConfig.componentDefinitions : [];
      let remainingVocabSelections = Math.max(0, config.maxVocabSelections);

      const visit = (definition: AnyRecord) => {
        const component = (definition?.component ?? {}) as AnyRecord;
        const componentClass = String(component?.class ?? '').trim();
        const componentConfig = (component?.config ?? {}) as AnyRecord;
        const modelConfig = ((definition?.model ?? {}) as AnyRecord)?.config as AnyRecord | undefined;

        if (componentClass === CheckboxTreeComponentName && remainingVocabSelections > 0) {
          const cfg = componentConfig as CheckboxTreeFieldComponentConfigOutline;
          const vocabRef = String(cfg?.vocabRef ?? '').trim();
          const values = Array.isArray(modelConfig?.value) ? modelConfig.value : [];
          const selectedValues = values
            .map((value): { notation: string; genealogy?: string[] } | null => {
              const notation = String((value as AnyRecord)?.notation ?? '').trim();
              if (!notation) {
                return null;
              }
              const genealogy = Array.isArray((value as AnyRecord)?.genealogy)
                ? ((value as AnyRecord).genealogy as unknown[]).map((item) => String(item ?? '').trim()).filter(Boolean)
                : undefined;
              return { notation, genealogy };
            })
            .filter((value): value is { notation: string; genealogy?: string[] } => value !== null)
            .slice(0, remainingVocabSelections);

          remainingVocabSelections -= selectedValues.length;
          if (vocabRef && selectedValues.length > 0) {
            checkboxTrees.push({ vocabRef, selectedValues });
          }
        }

        const nestedDefinitions = Array.isArray(componentConfig?.componentDefinitions)
          ? componentConfig.componentDefinitions as AnyRecord[]
          : [];
        for (const nestedDefinition of nestedDefinitions) {
          visit(nestedDefinition);
        }
      };

      for (const definition of componentDefinitions) {
        visit(definition as unknown as AnyRecord);
      }

      return checkboxTrees;
    }

    public async resolveVocabTrees(
      branding: BrandingModel | string,
      targets: CheckboxTreeTarget[]
    ): Promise<Record<string, FormPrehydrateVocabTreePayload>> {
      const payloadByVocabRef: Record<string, FormPrehydrateVocabTreePayload> = {};

      for (const target of targets) {
        const targetPayload = payloadByVocabRef[target.vocabRef] ?? {
          childrenByParentId: {},
          selectedNotations: []
        };

        for (const selected of target.selectedValues) {
          try {
            const chain = await this.resolveSelectionChain(branding, target.vocabRef, selected);
            if (chain.length === 0) {
              continue;
            }

            if (!targetPayload.selectedNotations.includes(selected.notation)) {
              targetPayload.selectedNotations.push(selected.notation);
            }

            const parentIdsToFetch: Array<string | null> = [null];
            for (const entry of chain.slice(0, -1)) {
              const entryId = String(entry.id ?? '').trim();
              if (entryId) {
                parentIdsToFetch.push(entryId);
              }
            }

            for (const parentId of parentIdsToFetch) {
              const parentKey = parentId || FormPrehydrateRootKey;
              if (targetPayload.childrenByParentId[parentKey]) {
                continue;
              }
              const response = await VocabularyService.getChildren(
                this.getBrandingName(branding),
                target.vocabRef,
                parentId ?? undefined
              ) as { entries: VocabTreeChildrenResponse['data']; meta: VocabTreeChildrenResponse['meta'] } | null;
              if (response) {
                targetPayload.childrenByParentId[parentKey] = {
                  data: response.entries,
                  meta: response.meta
                };
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to prehydrate vocab tree selection '${selected.notation}' for '${target.vocabRef}'`, error);
          }
        }

        if (!_.isEmpty(targetPayload.childrenByParentId) || targetPayload.selectedNotations.length > 0) {
          payloadByVocabRef[target.vocabRef] = targetPayload;
        }
      }

      return payloadByVocabRef;
    }

    private getPrehydrateConfig(): PrehydrateConfig {
      const configured = (sails.config.form?.prehydrate ?? {}) as {
        enabled?: boolean;
        maxVocabSelections?: number;
      };
      return {
        enabled: configured.enabled ?? true,
        maxVocabSelections: Number.isInteger(configured.maxVocabSelections)
          ? Math.max(0, Number(configured.maxVocabSelections))
          : 50,
      };
    }

    private getBrandingName(branding: BrandingModel | string): string {
      if (typeof branding === 'string') {
        return branding;
      }
      return String(branding?.name ?? branding?.id ?? '');
    }

    private async resolveSelectionChain(
      branding: BrandingModel | string,
      vocabRef: string,
      selected: CheckboxTreeTarget['selectedValues'][number]
    ): Promise<Array<{ id?: string | number; parent?: string | null; vocabulary?: string | number }>> {
      const genealogy = Array.isArray(selected.genealogy) ? selected.genealogy.filter(Boolean) : [];
      if (genealogy.length > 0) {
        const notationChain = [...genealogy, selected.notation];
        const resolvedChain = await Promise.all(notationChain.map((notation) =>
          VocabularyService.getEntryByNotation(this.getBrandingName(branding), vocabRef, notation)
        ));
        return resolvedChain
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .map((entry) => ({
            id: entry.id,
            parent: entry.parent ? String(entry.parent) : null,
            vocabulary: entry.vocabulary ? String(entry.vocabulary) : undefined
          }));
      }

      return await VocabularyService.getAncestorChain(this.getBrandingName(branding), vocabRef, selected.notation) as Array<{
        id?: string | number;
        parent?: string | null;
        vocabulary?: string | number;
      }>;
    }
  }
}

declare global {
  let FormPayloadPrehydrateService: Services.FormPayloadPrehydrateService;
}

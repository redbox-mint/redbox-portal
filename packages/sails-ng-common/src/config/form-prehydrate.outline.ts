import { CheckboxTreeNode } from './component/checkbox-tree.outline';

export const FormPrehydrateRootKey = '__root__' as const;

export interface VocabTreeChildrenResponse {
  data: CheckboxTreeNode[];
  meta: {
    vocabularyId: string;
    parentId: string | null;
    total: number;
  };
}

export interface FormPrehydrateVocabTreePayload {
  childrenByParentId: Record<string, VocabTreeChildrenResponse>;
  selectedNotations: string[];
}

export interface FormPrehydratePayload {
  vocabTrees?: Record<string, FormPrehydrateVocabTreePayload>;
}

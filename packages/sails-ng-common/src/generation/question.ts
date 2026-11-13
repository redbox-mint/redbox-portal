export const GENERATION_QUESTION_TYPES = ['text', 'textarea', 'boolean', 'date', 'enum', 'multiEnum'] as const;

export type GenerationQuestionType = (typeof GENERATION_QUESTION_TYPES)[number];
export type GenerationQuestionValue = string | boolean | string[] | null;

export interface GenerationQuestionOption {
  value: string;
  labelKey: string;
}

export interface GenerationQuestion {
  id: string;
  labelKey: string;
  helpTextKey?: string;
  type: GenerationQuestionType;
  required: boolean;
  options?: GenerationQuestionOption[];
  maxLength?: number;
  defaultValue?: GenerationQuestionValue;
}

export interface GenerationQuestionAnswer {
  id: string;
  value: GenerationQuestionValue;
}

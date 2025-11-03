import {ErrorResponseItemV2} from "./api";
import {MetaResponseItemV2} from "./api/APIResponseVersion2";

export const BuildResponseKind = ['json', ] as const;
export type BuildResponseKindType = typeof BuildResponseKind[number];

export interface BuildResponseType {
  kind?: BuildResponseKindType;
  data?: unknown;
  status?: number;
  headers?: { [key: string]: string };
  errors?: Error[];
  detailErrors?: ErrorResponseItemV2[];
  meta?: MetaResponseItemV2;
  v1?: unknown;
}

import type {
  PublishableRecordDefinitionAggregateDto,
  RecordDefinitionCanonicalHash,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import {
  canonicalizeRecordDefinition,
  hashRecordDefinition,
  serializeCanonicalRecordDefinition,
  validateRecordDefinitionDraftPayload,
  validateRecordDefinitionForPublication,
  type RecordDefinitionDraftPayloadValidationRequest,
  type RecordDefinitionDraftPayloadValidationResult,
  type RecordDefinitionPublicationValidationRequest,
  type RecordDefinitionPublicationValidationResult,
} from '../record-workflow-administration';

export interface RecordDefinitionValidationServiceExports {
  canonicalize(definition: PublishableRecordDefinitionAggregateDto): PublishableRecordDefinitionAggregateDto;
  serializeCanonical(definition: PublishableRecordDefinitionAggregateDto): string;
  hash(definition: PublishableRecordDefinitionAggregateDto): RecordDefinitionCanonicalHash;
  validateDraftPayload(
    request: RecordDefinitionDraftPayloadValidationRequest
  ): RecordDefinitionDraftPayloadValidationResult;
  validateForPublication(
    request: RecordDefinitionPublicationValidationRequest
  ): RecordDefinitionPublicationValidationResult;
}

export namespace Services {
  /** Authoritative, side-effect-free validation for administrable record definitions. */
  export class RecordDefinitionValidation extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'canonicalize',
      'serializeCanonical',
      'hash',
      'validateDraftPayload',
      'validateForPublication',
    ];

    public canonicalize(definition: PublishableRecordDefinitionAggregateDto): PublishableRecordDefinitionAggregateDto {
      return canonicalizeRecordDefinition(definition);
    }

    public serializeCanonical(definition: PublishableRecordDefinitionAggregateDto): string {
      return serializeCanonicalRecordDefinition(definition);
    }

    public hash(definition: PublishableRecordDefinitionAggregateDto): RecordDefinitionCanonicalHash {
      return hashRecordDefinition(definition);
    }

    public validateDraftPayload(
      request: RecordDefinitionDraftPayloadValidationRequest
    ): RecordDefinitionDraftPayloadValidationResult {
      return validateRecordDefinitionDraftPayload(request);
    }

    public validateForPublication(
      request: RecordDefinitionPublicationValidationRequest
    ): RecordDefinitionPublicationValidationResult {
      return validateRecordDefinitionForPublication(request);
    }
  }
}

declare global {
  const RecordDefinitionValidationService: Services.RecordDefinitionValidation;
}

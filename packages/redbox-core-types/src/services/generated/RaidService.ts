// This file is generated from internal/sails-ts/api/services/RaidService.ts. Do not edit directly.
import {RBValidationError, Services as services} from '../../index';
import {Sails} from "sails";
import {
  Access,
  AlternateUrl,
  Contributor,
  Description,
  ModelDate,
  Organisation,
  RaidApi,
  RaidCreateRequest,
  Title
} from '@researchdatabox/raido-openapi-generated-node';
import numeral from 'numeral';
import axios from 'axios';

export interface RaidService {
  mintTrigger(oid: any, record: any, options: any): Promise<any>;
  buildContributors(...args: any[]): any;
  buildContribVal(contributors: any, contribVal: any, contribConfig: any, startDate: any, endDate: any): any;
  mintPostCreateRetryHandler(oid: any, record: any, options: any): any;
  mintRetryJob(job: any): any;
}

/**
 * People Search Config Interface and Default Values
 * Auto-generated from config/peopleSearch.js
 *
 * At runtime, these are functions that return Observables.
 * The config values are resolved from service paths to actual functions.
 */

import { Observable } from 'rxjs';

export type PeopleSearchFunction = (givenNames: string, surname: string, page: number) => Observable<unknown>;

export interface PeopleSearchConfig {
  [searchType: string]: PeopleSearchFunction | string;
}

export const peopleSearch: PeopleSearchConfig = {
  orcid: 'orcid.search',
  nla: 'orcid.search',
};

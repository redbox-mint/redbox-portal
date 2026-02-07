// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Services as services } from '../CoreService';
import { DatastreamService } from '../DatastreamService';
import { RBValidationError } from '../model/RBValidationError';
import { firstValueFrom } from 'rxjs';
import { promises as fs } from 'fs';
import path from 'node:path';
import { createWriteStream } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
const finished = promisify(stream.finished);
import * as mime from 'mime-types';
const { Collector, generateArcpId } = require('oni-ocfl');
const { languageProfileURI } = require('language-data-commons-vocabs');
const { ROCrate } = require('ro-crate');

let wktParserHelper: unknown = null;

const URL_PLACEHOLDER = '{ID_WILL_BE_HERE}'; // config
const DEFAULT_IDENTIFIER_NAMESPACE = 'redbox';
type AnyRecord = Record<string, unknown>;

export namespace Services {
	/**
	 *
	 *  Creates a ROCRate record from a ReDBox data publication record and writes it to the OCFL repository
	 *
	 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
	 *
	 */
	export class OniService extends services.Core.Service {
    private asError(err: unknown): Error {
      return err instanceof Error ? err : new Error(String(err));
    }

		protected override _exportedMethods: string[] = [
			'exportDataset'
		];

		datastreamService: DatastreamService | null = null;

		constructor() {
			super();
			this.logHeader = "OniService::";
			const that = this;
			this.registerSailsHook('on', 'ready', function () {
				that.getDatastreamService();
			});
		}

		protected override async processDynamicImports() {
      	  	wktParserHelper = await import("wkt-parser-helper");
    	}

		getDatastreamService() {
			const serviceName = sails.config.record.datastreamService;
			if (!serviceName) {
				return;
			}
			this.datastreamService = sails.services[serviceName] as unknown as DatastreamService;
		}

		/**
		 *  Converts a RB Data Publication record into RO-Crate and writes it to the OCFL repository
		 *
		 * @param oid
		 * @param record
		 * @param options
		 * @param user
		 */

		public async exportDataset(oid: string, record: unknown, options: unknown, user: unknown) {
      const recordObj = (record ?? {}) as AnyRecord;
      const optionsObj = (options ?? {}) as AnyRecord;
      let userObj = (user ?? {}) as AnyRecord;
			if( this.metTriggerCondition(oid, recordObj, optionsObj) === "true") {
				const rootColConfig = sails.config.datapubs.rootCollection;
				const site = sails.config.datapubs.sites[optionsObj['site'] as string];
				if( ! site ) {
          const msg = `Unknown publication site`;
          throw  new RBValidationError({
            message: `${msg}: ${optionsObj['site']}`,
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}
				const md = (recordObj['metadata'] ?? {}) as AnyRecord;
				const drec = md['dataRecord'] as AnyRecord;
				const drid = drec ? drec['oid'] : undefined;
				if(!drid) {
					const msg = `Couldn't find dataRecord or id for data pub`;
					throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid}`,
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}
				if(! userObj || ! userObj['email']) {
					userObj = { 'email': '' };
					const msg = `Empty user or no email found`;
					// TODO: should we throw here?
          throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid}`,
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}
				// set the dataset URL and DOI
				let datasetUrl = '';
				if (site.useCleanUrl)	{
					datasetUrl = `${site['url']}/${oid}`;
				} else {
					const recUrlOid = encodeURIComponent(`arcp://name,${sails.config.datapubs.rootCollection.targetRepoNamespace}/${oid}`);
					const recUrl = `id=${recUrlOid}&_crateId=${recUrlOid}`;
					datasetUrl = `${site['url']}/object?${recUrl}` ;
				}
				md['citation_url'] = datasetUrl;
				const citationDoi = String(md['citation_doi'] ?? '');
				md['citation_doi'] = citationDoi.replace(URL_PLACEHOLDER, datasetUrl);

				// get the repository, then write out the attachments and the RO-Crate
				const targetCollector = new Collector({
					repoPath: site.dir,
					namespace: rootColConfig.targetRepoNamespace,
					tempPath: site.tempPath,
					repoScratch: site.repoScratch
				});
				try {
					await targetCollector.connect();
				} catch (err) {
          const msg = `Error connecting to target collector`;
					throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid} site dir ${site.dir}`,
            options: {cause: err},
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}
				let rootCollection = targetCollector.repo.object(rootColConfig.rootCollectionId);
				try {
					await rootCollection.load();
					// check if the root collection exists in disk, otherwise populate the root collection's properties
					rootCollection = targetCollector.newObject();
					rootCollection.crate.addProfile(languageProfileURI("Collection"));
					rootCollection.rootDataset["@type"] = rootColConfig.dsType;
					rootCollection.mintArcpId(rootColConfig.targetRepoColId);
					rootCollection.rootId = generateArcpId(targetCollector.namespace, rootColConfig.targetRepoColId);
					rootCollection.rootDataset.name = rootColConfig.targetRepoColName;
					rootCollection.rootDataset.description = rootColConfig.targetRepoColDescription;
					rootCollection.rootDataset.license = rootColConfig.defaultLicense;
					if (await this.pathExists(rootCollection.root) === false) {
						await rootCollection.addToRepo();
					}
				} catch (err) {
          const msg = `Error loading root collection`;
          throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid} rootCollectionId ${rootColConfig.rootCollectionId}`,
            options: {cause: err},
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}

        const recordMeta = (recordObj['metaMetadata'] ?? {}) as AnyRecord;
				const creator = await firstValueFrom(UsersService.getUserWithUsername(recordMeta['createdBy'] as string));

				if (_.isEmpty(creator)) {
          const msg = `Error getting creator for record`
          throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid} creator ${recordMeta['createdBy']}`,
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site'], 'creator': recordMeta['createdBy']}}],
          });
				}
				try {
					const tempDir = site.tempDir ?? site.tempPath ?? site.dir;
					await this.writeDatasetObject(creator as AnyRecord, userObj, oid, drid as string, targetCollector, rootCollection, recordObj, tempDir);
				} catch (err) {
          const msg = `Error writing dataset object for`;
          throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid} `,
            options: {cause: err},
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}

					try {
						await RecordsService.updateMeta(sails.config.auth.defaultBrand as unknown, oid, recordObj, {}, true, false);
				} catch (err) {
					this.recordPublicationError(oid, recordObj, this.asError(err));
          const msg = `Error updating record metadata`;
          throw new RBValidationError({
            message: `${msg}: site ${optionsObj['site']} oid ${oid} `,
            displayErrors: [{detail: msg, meta: {'oid': oid, 'site': optionsObj['site']}}],
          });
				}
			} else {
				sails.log.debug(`Not publishing: ${oid}, condition not met: ${_.get(options, "triggerCondition", "")}`);
			}
		}
		/**
		 *  Write the dataset object to the OCFL repository
		 *
		 * @param creator
		 * @param approver
		 * @param oid
		 * @param drid
		 * @param targetCollector
		 * @param rootCollection
		 * @param record
		 * @param tempDir
		 */
			private async writeDatasetObject(
        creator: AnyRecord,
        approver: AnyRecord,
        oid: string,
        drid: string,
        targetCollector: AnyRecord,
        rootCollection: AnyRecord,
        record: AnyRecord,
        tempDir: string
      ): Promise<void> {
      if (!this.datastreamService) {
        throw new Error('Datastream service is not initialized');
      }
					const metadata = (record['metadata'] ?? {}) as AnyRecord;
				const metaMetadata = (record['metaMetadata'] ?? {}) as AnyRecord;
				const mdOnly = !!metadata['accessRightsToggle'];
					const dataLocations = (metadata['dataLocations'] ?? []) as AnyRecord[];
					const attachments = dataLocations.filter((a: AnyRecord) => (
						!mdOnly && a['type'] === 'attachment' && a['selected']
					));
			// write all valid attachments to temp directory
			const oidTempDir = path.join(tempDir, oid);
				try {
					attachments.map((a: AnyRecord) => {
						// a['fileId'] necessary to avoid file name clashes within the dataset
						const fileId = String(a['fileId'] ?? '');
						const fileName = String(a['name'] ?? '');
						a['parentDir'] = path.join(oidTempDir, fileId);
						a['path'] = path.join(a['parentDir'] as string, fileName);
					});
					for (const a of attachments) {
						const datastream = await this.datastreamService.getDatastream(drid, String(a['fileId'] ?? ''));
						let dataFile;
						if (datastream.readstream) {
							dataFile = datastream.readstream;
						} else {
							const body = datastream.body ?? '';
							dataFile = Buffer.isBuffer(body) ? body : Buffer.from(body);
						}
						await this.writeDatastream(dataFile, String(a['parentDir'] ?? ''), String(a['name'] ?? ''));
					}
			} catch (err) {
				await this.removeTempDir(oidTempDir);
        const msg = `Error writing attachments for dataset`;
        throw new RBValidationError({
          message: `${msg}: oid ${oid} `,
          options: {cause: err},
          displayErrors: [{detail: msg, meta: {'oid': oid}}],
        });
			}
			try {
				await this.writeDatasetROCrate(creator, approver, oid, attachments, record, targetCollector, rootCollection);
			} catch (err) {
        const msg = `Error writing dataset RO-Crate`;
        throw new RBValidationError({
          message: `${msg}: oid ${oid} `,
          options: {cause: err},
          displayErrors: [{detail: msg, meta: {'oid': oid}}],
        });
			} finally {
				await this.removeTempDir(oidTempDir);
			}
		}

		private async removeTempDir(tempDir: string) {
			// remove the temp record-specific attachment directory
			try {
				if (await this.pathExists(tempDir)) {
					await fs.rm(tempDir, { recursive: true });
				}
			} catch (err) {
				sails.log.warn(`${this.logHeader} writeDatasetObject() -> Error removing temp directory ${tempDir}: ${this.asError(err).message}`);
			}
		}
		/**
		 *
		 * Builds and persists the rocrate object to the OCFL repository
		 *
		 * @param creator
		 * @param approver
		 * @param oid
		 * @param attachments
		 * @param record
		 * @param targetCollector
		 * @param rootCollection
		 */
			private async writeDatasetROCrate(
      creator: AnyRecord,
      approver: AnyRecord,
      oid: string,
      attachments: AnyRecord[],
      record: AnyRecord,
      targetCollector: AnyRecord,
      rootCollection: AnyRecord
    ) {
				const metadata = (record['metadata'] ?? {}) as AnyRecord;
				const metaMetadata = (record['metaMetadata'] ?? {}) as AnyRecord;
				// Create Dataset/Repository Object
				const targetRepoObj = (targetCollector.newObject as () => AnyRecord)();
				const targetCrate = (targetRepoObj.crate ?? {}) as AnyRecord;
				const extraContext: AnyRecord = {};
				const rootDataset = (targetRepoObj.rootDataset ?? {}) as AnyRecord;
				targetRepoObj.rootDataset = rootDataset;
				// use the OID as the root
				(targetRepoObj.mintArcpId as (id: string) => void)(oid);
				targetCrate.rootId = generateArcpId(targetCollector.namespace, oid);
				(targetCrate.addProfile as (profile: unknown) => void)(languageProfileURI("Object"));
				rootDataset["@type"] = ["Dataset", "RepositoryObject"];
				(targetRepoObj.mintArcpId as (id: string) => void)(oid);
				// Set the basic properties
				rootDataset.identifier = oid;
				rootDataset.name = metadata['title'];
				rootDataset.description = metadata['description'];
				const now = (new Date()).toISOString();
				rootDataset.dateCreated = metaMetadata['createdOn'];
				rootDataset.yearCreated = this.getYearFromDate(rootDataset.dateCreated as string);
				rootDataset.datePublished = now;
				rootDataset.yearPublished = this.getYearFromDate(rootDataset.datePublished as string);
				rootDataset.keywords = metadata['finalKeywords'];
				// Set the publisher
				// https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#organizations-as-values
				rootDataset.publisher = sails.config.datapubs.metadata.organization;
				// Set the author
				// https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#people
				rootDataset.author = this.getCreators(metadata, sails.config.datapubs.metadata.organization);
				// Set the contact point
				// https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#contact-information
					const contributor = (metadata['contributor_data_manager'] ?? {}) as AnyRecord;
					const contactPoint = this.getPerson(contributor, "ContactPoint");
					if (contactPoint) {
					contactPoint['contactType'] = "Data Manager";
					contactPoint['identifier'] = contactPoint['id'];
						const author = _.find(rootDataset.author as AnyRecord[], (a: AnyRecord) => a['@id'] === contactPoint['@id']);
						contactPoint['@id'] = `mailto:${contactPoint['email']}`
						if (author) {
							author['contactPoint'] = contactPoint;
						} else {
							// Add the contact point as a contributor
							const contactPointPerson = this.getPerson(contributor, "Person");
							if (contactPointPerson) {
								contactPointPerson['contactPoint'] = contactPoint;
								rootDataset['contributor'] = [contactPointPerson];
							}
						}
					}
				// Set the license
				rootDataset.license = this.getLicense(metadata) as unknown as AnyRecord;
				// Set the files
				await this.addFiles(targetRepoObj, record, attachments);
			// Set the related works
			this.addRelatedWorks(targetRepoObj, metadata);
			// Set the spatial coverage
			this.addSpatialCoverage(targetRepoObj, metadata, extraContext);
			// Set the temporal coverage
			this.addTemporalCoverage(targetRepoObj, metadata, extraContext);
			// Set the funders
			this.addFunders(targetRepoObj, metadata, extraContext);
			// Set about
			this.addSubjects(targetRepoObj, metadata, extraContext);
			// Set the provenance
			this.addHistory(targetRepoObj, metadata, creator, approver);
			// Finally...
				if (!_.isEmpty(extraContext)) {
					(targetCrate.addContext as (ctx: AnyRecord) => void)(extraContext);
				}
				rootDataset["memberOf"] = (rootCollection as AnyRecord).rootDataset;
				await (targetRepoObj.addToRepo as () => Promise<void>)();
		}

			private addHistory(targetRepoObj: AnyRecord, metadata: AnyRecord, creator: AnyRecord, approver: AnyRecord) {
				// check if the creator and approver are in the author list, if not add them
				sails.log.verbose(`${this.logHeader} addHistory() -> adding creator and approver to the author list`);
				const rootDataset = (targetRepoObj.rootDataset ?? {}) as AnyRecord;
				const crate = (targetRepoObj.crate ?? {}) as AnyRecord;
				const people = _.concat((rootDataset.author ?? []) as AnyRecord[], (rootDataset.contributor ?? []) as AnyRecord[]);
				let creatorPerson =  _.find(people, (a: AnyRecord) => a && a['email'] == creator['email']) as AnyRecord | undefined;
				let approverPerson = _.find(people, (a: AnyRecord) => a && a['email'] == approver['email']) as AnyRecord | undefined;

				if (!creatorPerson) {
					creatorPerson = this.getPerson(creator, "Person");
						if (creatorPerson) {
							(crate.addEntity as (entity: AnyRecord) => void)(creatorPerson);
						}
					}
					if (!approverPerson) {
						approverPerson = this.getPerson(approver, "Person");
						if (approverPerson) {
							(crate.addEntity as (entity: AnyRecord) => void)(approverPerson);
						}
					}
				if (!creatorPerson || !approverPerson) {
					return;
				}
				// add the history entries
				sails.log.verbose(`${this.logHeader} addHistory() -> adding history entries`);
				(crate.addEntity as (entity: AnyRecord) => void)({
					'@id': 'history1',
					'@type': 'CreateAction',
					'name': 'Create',
					'description': 'Data record created',
					'endTime': rootDataset.dateCreated,
					'object': {'@id': crate.rootId},
					'agent': {'@id': creatorPerson['@id']}
				});
				(crate.addEntity as (entity: AnyRecord) => void)({
					'@id': 'history2',
					'@type': 'UpdateAction',
					'name': 'Publish',
					'endTime': rootDataset.datePublished,
					'object': {'@id': crate.rootId},
					'agent': {'@id': approverPerson['@id']}
				});
			}

			private addSubjects(targetRepoObj: AnyRecord, metadata: AnyRecord, extraContext: AnyRecord) {
			sails.log.verbose(`${this.logHeader} addSubjects() -> adding subjects to the dataset`);
			const rootDataset = (targetRepoObj.rootDataset ?? {}) as AnyRecord;
			targetRepoObj.rootDataset = rootDataset;
			const subjects: AnyRecord[] = [];
			for (const subjectField of sails.config.datapubs.metadata.subjects) {
				const fieldVals = _.isArray(metadata[subjectField]) ? (metadata[subjectField] as AnyRecord[]) : [metadata[subjectField] as AnyRecord];
				sails.log.verbose(`${subjectField} -> fieldVal: ${JSON.stringify(fieldVals)}`);
				if (!_.isEmpty(fieldVals)) {
					for (const fieldVal of fieldVals) {
						const fieldValObj = fieldVal as AnyRecord;
						if (!_.isEmpty(fieldVal)) {
							const id = `${sails.config.datapubs.metadata.DEFAULT_IRI_PREFS['about'][subjectField]}${fieldValObj['notation']}`;
							const subject = {
								'@id': id,
								'@type': 'StructuredValue',
								'url': id,
								'identifier': id,
								'name': fieldValObj['name']
							};
							subjects.push(subject);
						}
					}
				}
			}
			rootDataset['about'] = subjects;
		}

			private addFunders(targetRepoObj: AnyRecord, metadata: AnyRecord, extraContext: AnyRecord) {
			sails.log.verbose(`${this.logHeader} addFunders() -> adding funders to the dataset`);
			const rootDataset = (targetRepoObj.rootDataset ?? {}) as AnyRecord;
			targetRepoObj.rootDataset = rootDataset;
			const funders: AnyRecord[] = [];
			for (const fundingField of sails.config.datapubs.metadata.funders) {
				const fieldVals = _.isArray(metadata[fundingField]) ? (metadata[fundingField] as AnyRecord[]) : [metadata[fundingField] as AnyRecord];
				sails.log.verbose(`${fundingField} -> fieldVal: ${JSON.stringify(fieldVals)}`);

				for (const fieldVal of fieldVals) {
					const fieldValObj = fieldVal as AnyRecord;
					if (!_.isEmpty(fieldVal) && !_.isEmpty(_.get(fieldVal, 'dc_identifier[0]'))) {
						const dcIds = (fieldValObj['dc_identifier'] ?? []) as string[];
						const id = `${sails.config.datapubs.metadata.DEFAULT_IRI_PREFS['funder']}${dcIds[0] ?? ''}`;
						const funder = {
							'@id': id,
							'@type': 'Organization',
							'name': fieldValObj['dc_title'],
							'identifier': id
						};
						funders.push(funder);
					}
				}
			}
			rootDataset['funder'] = funders;
		}

			private addTemporalCoverage(targetRepoObj: AnyRecord, metadata: AnyRecord, extraContext: AnyRecord) {
			sails.log.verbose(`${this.logHeader} addTemporalCoverage() -> adding temporal coverage to the dataset`);
			const rootDataset = (targetRepoObj.rootDataset ?? {}) as AnyRecord;
			targetRepoObj.rootDataset = rootDataset;
			let tc = '';
				if( metadata['startDate'] ) {
					tc = String(metadata['startDate'] ?? '');
					if( metadata['endDate'] ) {
						tc += '/' + String(metadata['endDate'] ?? '');
					}
				} else if ( metadata['endDate'] ) {
					tc = String(metadata['endDate'] ?? '');
				}
				if( metadata['timePeriod'] ) {
					if( tc ) {
						tc = tc + '; ' + String(metadata['timePeriod'] ?? '');
					} else {
						tc = String(metadata['timePeriod'] ?? '');
					}
				}
			if (!_.isEmpty(tc)) {
				rootDataset.temporalCoverage = tc;
			}
		}

			private addSpatialCoverage(targetRepoOjb: AnyRecord, metadata: AnyRecord, extraContext: AnyRecord) {
			sails.log.verbose(`${this.logHeader} addSpatialCoverage() -> adding spatial coverage to the dataset`);
			const rootDataset = (targetRepoOjb.rootDataset ?? {}) as AnyRecord;
			targetRepoOjb.rootDataset = rootDataset;
			if (!_.isEmpty(metadata['geospatial'])) {
				if (_.isEmpty(extraContext['Geometry'])) {
					extraContext['Geometry'] =  "http://www.opengis.net/ont/geosparql#Geometry";
					extraContext['asWKT'] = "http://www.opengis.net/ont/geosparql#asWKT";
				}
				let geospatial = metadata['geospatial'] as AnyRecord[] | AnyRecord;
				sails.log.verbose(`spatialCoverage -> ${JSON.stringify(geospatial)}`);
				if (!_.isArray(geospatial)) {
					geospatial = [geospatial];
				}
				// COmmenting out the "proper way" of GEOMETRYCOLLECTION as it doesn't show up in the UI!
				const convertedGeoJson = _.map(geospatial, (geoJson: unknown, idx: number) => {
					return {
						"@id": `_:place-${idx}`,
						"@type": "Place",
						"geo": this.convertToWkt(`_:geo-${idx}`, geoJson)
					};
				});
				// NOTE: the "proper way" of GEOMETRYCOLLECTION doesn't show up in the UI (unsupported)
				// Code below is for converting each feature collection entry as a separate place in the hopes that it will show up in the UI
				// const convertedGeoJson = [];
				// _.each(geospatial, (geoJson, idx) => {
				// 	if (geoJson['type'] === 'FeatureCollection') {
				// 		_.each(geoJson['features'], (feature, fIdx) => {
				// 			convertedGeoJson.push({
				// 				"@id": `_:place-${idx}-${fIdx}`,
				// 				"@type": "Place",
				// 				"geo": this.convertToWkt(`_:geo-${idx}-${fIdx}`, feature)
				// 			});
				// 		});
				// 	} else {
				// 		convertedGeoJson.push({
				// 			"@id": `_:place-${idx}`,
				// 			"@type": "Place",
				// 			"geo": this.convertToWkt(`_:geo-${idx}`, geoJson)
				// 		});
				// 	}

				// });
				sails.log.verbose(`Converted spatialCoverage -> ${JSON.stringify(convertedGeoJson)}`)
				rootDataset.spatialCoverage = convertedGeoJson;
			} else {
				sails.log.verbose(`No geospatial field found in metadata`);
			}
		}

		private convertToWkt(id: string, geoJsonSrc: unknown) {
			const geoJson = _.cloneDeep(geoJsonSrc);
			_.unset(geoJson, '@type');
			const wkt = (wktParserHelper as { convertToWK: (input: unknown) => string }).convertToWK(geoJson);
			sails.log.verbose(`Converted WKT -> ${wkt}`);
			return {
				"@id": id,
				"@type": "Geometry",
				"asWKT": wkt
			};
		}

			private addRelatedWorks(targetRepoObj: AnyRecord, metadata: AnyRecord) {
			const rootDataset = (targetRepoObj.rootDataset ?? {}) as AnyRecord;
			targetRepoObj.rootDataset = rootDataset;
			for (const relatedFieldConf of sails.config.datapubs.metadata.related_works) {
				const relatedField = relatedFieldConf as unknown as AnyRecord;
				const relatedWorks: AnyRecord[] = [];
				const fieldKey = `related_${relatedField.field}`;
				const fieldVals = _.isArray(metadata[fieldKey]) ? (metadata[fieldKey] as AnyRecord[]) : [metadata[fieldKey] as AnyRecord];
				sails.log.verbose(`related_${relatedField.field} -> fieldVal: ${JSON.stringify(fieldVals)}`);

				for (const fieldVal of fieldVals) {
					const fieldValObj = fieldVal as AnyRecord;
					if (!_.isEmpty(fieldVal) && !_.isEmpty(fieldVal['related_url'])) {
							const relatedWork: AnyRecord = {
							'@id': fieldValObj['related_url'],
							'@type': relatedField.type,
							'name': fieldValObj['related_title'],
							'identifier': fieldValObj['related_url']
						};
						if (!_.isEmpty(fieldValObj.related_notes)) {
							relatedWork['description'] = fieldValObj.related_notes;
						}
						relatedWorks.push(relatedWork);
					}
				}
				rootDataset[relatedField.field as string] = relatedWorks;
			}
		}

		private async addFiles(targetRepoObj: AnyRecord, record: AnyRecord, attachments: AnyRecord[]) {
			for (const a of attachments) {
				const fileName = String(a['name'] ?? '');
				const fileAttMetaPart = {
					"name": fileName,
					"@id": fileName,
					"@type": ["File"],
					"encodingFormat": mime.lookup(fileName)
				};
				await (targetRepoObj.addFile as (meta: AnyRecord, dir: string, name: string) => Promise<void>)(fileAttMetaPart, String(a['parentDir'] ?? ''), fileName);
			}
		}

			private getLicense(metadata: AnyRecord): AnyRecord[] {
			const licenses = [];
			if (!_.isEmpty(metadata['license_other_url']) || !_.isEmpty(metadata['license_notes'])) {
				if(metadata['license_other_url'] ) {
					licenses.push({
						'@id': metadata['license_other_url'],
						'@type': 'CreativeWork',
						'url': metadata['license_other_url'],
						'name': ( metadata['license_notes'] || metadata['license_other_url'])
					});
				} else {
					licenses.push({
						'@id': sails.config.datapubs.metadata.DEFAULT_IRI_PREFS['license'] + 'other',
						'@type': 'CreativeWork',
						'name': metadata['license_notes']
					});
				}
			}
			if(metadata['license_identifier'] && metadata['license_identifier'] !== 'undefined' ) {
				licenses.push({
					'@id': metadata['license_identifier'],
					'@type': 'CreativeWork',
					'name': metadata['license_identifier'],
					'url': metadata['license_identifier']
				});
			}

			if(metadata['accessRights_url']) {
				licenses.push({
					'@id': metadata['accessRights_url'],
					'@type': 'WebSite',
					'name': "Conditions of Access",
					'url': metadata['accessRights_url']
				});
			}
			// if no license is found, use the default license because the ONI indexers require a license
				if (_.isEmpty(licenses) && sails.config.datapubs.rootCollection.enableDatasetToUseDefaultLicense) {
					licenses.push(sails.config.datapubs.rootCollection.defaultLicense as unknown as AnyRecord);
				}
			return licenses;
		}

			private getCreators(metadata: AnyRecord, organization: unknown): AnyRecord[] {
				const organizationObj = (organization ?? {}) as AnyRecord;
				let creators: AnyRecord[] = [];
				const creatorList = (metadata['creators'] ?? []) as AnyRecord[];
				if (!_.isEmpty(creatorList)) {
					creators = _.compact(creatorList.map((creator: AnyRecord) => {
						 const person = this.getPerson(creator, "Person");
						 if (person) {
							 person['affiliation'] = organizationObj;
							 return person;
						 }
	           return undefined;
					})) as AnyRecord[];
				}
				return creators;
			}

			private getPerson(rbPerson: AnyRecord, type:string): AnyRecord | undefined {
				// ORCID prioritised as per https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#identifiers-for-contextual-entities
				const id = rbPerson['orcid'] || rbPerson['email'] || rbPerson['text_full_name'];
				if (!id) {
					return undefined;
				}
				return {
				"@id": id,
				"@type": type,
				"name": rbPerson['text_full_name'],
				"givenName": rbPerson['givenName'],
				"familyName": rbPerson['familyName'],
				"email": rbPerson['email']
			};
		}

		private getYearFromDate(dateString: string):string {
			const date = new Date(dateString);
			const year = date.getFullYear();
			return year.toString();
		}

		private async ensureDir(dirPath: string): Promise<void> {
			try {
				await fs.access(dirPath, fs.constants.F_OK);
				// Directory exists, nothing to do
			} catch {
				// Directory does not exist, create it
				await fs.mkdir(dirPath, { recursive: true });
			}
		}

		private async pathExists(path: string): Promise<boolean> {
			try {
				await fs.access(path, fs.constants.F_OK);
				return true;
			} catch {
				return false;
			}
		}

		private async writeToFileUsingStream(filePath: string, inputStream: unknown): Promise<void> {
			const writeStream = createWriteStream(filePath);
	    const readable = inputStream as NodeJS.ReadableStream;
	    readable.pipe(writeStream);
  	  await finished(writeStream); // Wait for the stream to finish
		}

		// writeDatastream works for new redbox-storage -- using sails-hook-redbox-storage-mongo.

		private async writeDatastream(stream: unknown, dir: string, fn: string) {
			await this.ensureDir(dir);
			await this.writeToFileUsingStream(path.join(dir, fn), stream);
		}

			private async recordPublicationError(oid: string, record: AnyRecord, err: Error): Promise<void> {
				const branding = sails.config.auth.defaultBrand;
			// turn off postsave triggers
			sails.log.verbose(`${this.logHeader} recordPublicationError() -> recording publication error in record metadata`);
				const metadata = (record['metadata'] ?? {}) as AnyRecord;
				metadata['publication_error'] = "Data publication failed with error: " + err.name + " " + err.message;
				record['metadata'] = metadata;
				await RecordsService.updateMeta(branding as unknown, oid, record, {}, true, false);
			}

	}

}

declare global {
  let OniService: Services.OniService;
}

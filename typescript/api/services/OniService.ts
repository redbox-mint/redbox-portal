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

import { Services as services, DatastreamService, RBValidationError } from '@researchdatabox/redbox-core-types';
import { Sails } from "sails";
import 'rxjs/add/operator/toPromise';
import { promises as fs } from 'fs';
import path from 'node:path'; 
import {Collector, generateArcpId} from "oni-ocfl";
import { createWriteStream } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
const finished = promisify(stream.finished);
import {languageProfileURI} from "language-data-commons-vocabs";
import * as mime from 'mime-types';
import {ROCrate} from "ro-crate";
const { convertToWK } = require('wkt-parser-helper');

declare var sails: Sails;
declare var RecordsService, UsersService;
declare var _;

const URL_PLACEHOLDER = '{ID_WILL_BE_HERE}'; // config
const DEFAULT_IDENTIFIER_NAMESPACE = 'redbox';

export module Services {
	/**
	 *
	 * a Service to extract a DataPub and put it in a RO-Crate with the
	 * metadata crosswalked into the right JSON-LD
	 *
	 * @author <a target='_' href='https://github.com/spikelynch'>Mike Lynch</a>
	 *
	 */
	export class OniService extends services.Core.Service {

		protected _exportedMethods: any = [
			'exportDataset'
		];

		datastreamService: DatastreamService = null;

		constructor() {
			super();
			this.logHeader = "OniService::";
			let that = this;
			sails.on('ready', function () {
				that.getDatastreamService();
			});
		}

		getDatastreamService() {
			this.datastreamService = sails.services[sails.config.storage.serviceName];
		}

		private getRBError(logPrefix: string, message: string) {
			let customError: RBValidationError = new RBValidationError(message)
			sails.log.error(`${logPrefix}->${message}`);
			return customError;
		}

		/**
		 *  Converts a RB Data Publication record into RO-Crate and writes it to the OCFL repository
		 * 
		 * @param oid 
		 * @param record 
		 * @param options 
		 * @param user 
		 */

		public async exportDataset(oid, record, options, user) {
			if( this.metTriggerCondition(oid, record, options) === "true") {
				const rootColConfig = sails.config.datapubs.rootCollection;
				const site = sails.config.datapubs.sites[options['site']];
				if( ! site ) {
					throw this.getRBError(`${this.logHeader } exportDataset()`, "Unknown publication site " + options['site']);
				}
				const md = record['metadata'];
				const drec = md['dataRecord'];
				const drid = drec ? drec['oid'] : undefined;
				if(!drid) {
					const err = `Couldn't find dataRecord or id for data pub: ${oid}`;
					throw this.getRBError(`${this.logHeader} exportDataset()`, err);
				}
				if(! user || ! user['email']) {
					user = { 'email': '' };
					const err = `Empty user or no email found: ${oid}`;
					// TODO: should we throw here?
					throw this.getRBError(`${this.logHeader} exportDataset()`, err);
				}
				// set the dataset URL and DOI
				const datasetUrl = site['url'] + '/' + oid + '/';
				md['citation_url'] = datasetUrl;
				md['citation_doi'] = md['citation_doi'].replace(URL_PLACEHOLDER, datasetUrl);

				// get the repository, then write out the attachments and the RO-Crate
				const targetCollector = new Collector({repoPath: site.dir, namespace: rootColConfig.targetRepoNamespace});
				try {
					await targetCollector.connect();
				} catch (err) {
					throw this.getRBError(`${this.logHeader} exportDataset()`, `Error connecting to target collector ${site.dir}: ${err}`);
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
					throw this.getRBError(`${this.logHeader} exportDataset()`, `Error loading root collection ${site.rootCollectionId}: ${err}`);
				}
				
				let creator = await UsersService.getUserWithUsername(record['metaMetadata']['createdBy']).toPromise();

				if (_.isEmpty(creator)) {
					throw this.getRBError(`${this.logHeader} exportDataset()`, `Error getting creator for record ${oid} :: ${record['metaMetadata']['createdBy']}`);
				}
				try {
					await this.writeDatasetObject(creator, user, oid, drid, targetCollector, rootCollection, record, site.tempDir);
				} catch (err) {
					throw this.getRBError(`${this.logHeader} exportDataset()`, `Error writing dataset object for ${oid}: ${err}`);
				}

				try {
					await RecordsService.updateMeta(sails.config.auth.defaultBrand, oid, record, null, true, false);
				} catch (err) {
					this.recordPublicationError(oid, record, err);
					throw this.getRBError(`${this.logHeader} exportDataset()`, `Error updating record metadata for ${oid}: ${err}`);
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
		private async writeDatasetObject(creator: Object, approver: Object, oid: string, drid: string, targetCollector: Collector, rootCollection: any, record: Object, tempDir:string): Promise<any> {
			const metadata = record['metadata'];
			const metaMetadata = record['metaMetadata'];
			const mdOnly = metadata['accessRightsToggle'];
			const attachments = metadata['dataLocations'].filter(
				(a) => ( !mdOnly && a['type'] === 'attachment' && a['selected'] )
			);
			// write all valid attachments to temp directory
			try {
				attachments.map((a) => {
					// a['fileId'] necessary to avoid file name clashes within the dataset
					a['parentDir'] = path.join(tempDir, oid, a['fileId']);
					a['path'] = path.join(a['parentDir'] , a['name']);
				});
				for (let a of attachments) {
					const datastream = await this.datastreamService.getDatastream(drid, a['fileId']);
					let dataFile;
					if (datastream.readstream) {
						dataFile = datastream.readstream;
					} else {
						dataFile = Buffer.from(datastream.body);
					}
					await this.writeDatastream(dataFile, a['parentDir'], a['name']);
				}
			} catch (err) {
				throw this.getRBError(`${this.logHeader} writeDatasetObject()`, `Error writing attachments for dataset ${oid}: ${err}`);
			}
			await this.writeDatasetROCrate(creator, approver, oid, attachments, record, targetCollector, rootCollection);
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
		private async writeDatasetROCrate(creator: Object, approver: Object, oid:string, attachments: any[], record: Object, targetCollector: Collector, rootCollection: any) {
			const metadata = record['metadata'];
			const metaMetadata = record['metaMetadata'];
			// Create Dataset/Repository Object	
			let targetRepoObj = targetCollector.newObject();
			let targetCrate = targetRepoObj.crate;
			let extraContext = {};
			// use the OID as the root
			targetRepoObj.mintArcpId(oid);
			targetCrate.rootId = generateArcpId(targetCollector.namespace, oid);
			targetCrate.addProfile(languageProfileURI("Object"));
			targetRepoObj.rootDataset["@type"] = ["Dataset", "RepositoryObject"];
			targetRepoObj.mintArcpId(oid);
			// Set the basic properties
			targetRepoObj.rootDataset.identifier = oid;
			targetRepoObj.rootDataset.name = metadata['title'];
			targetRepoObj.rootDataset.description = metadata['description'];
			const now = (new Date()).toISOString();
			targetRepoObj.rootDataset.dateCreated = metaMetadata['createdOn'];
			targetRepoObj.rootDataset.yearCreated = this.getYearFromDate(targetRepoObj.rootDataset.dateCreated);
			targetRepoObj.rootDataset.datePublished = now;
			targetRepoObj.rootDataset.yearPublished = this.getYearFromDate(targetRepoObj.rootDataset.datePublished); 
			targetRepoObj.rootDataset.keywords = metadata['finalKeywords'];
			// Set the publisher
			// https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#organizations-as-values
			targetRepoObj.rootDataset.publisher = sails.config.datapubs.metadata.organization;
			// Set the author
			// https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#people
			targetRepoObj.rootDataset.author = this.getCreators(metadata, sails.config.datapubs.metadata.organization);
			// Set the contact point
			// https://www.researchobject.org/ro-crate/specification/1.1/contextual-entities.html#contact-information
			const contactPoint = this.getPerson(metadata['contributor_data_manager'], "ContactPoint");
			if (contactPoint) {
				contactPoint['contactType'] = "Data Manager";
				contactPoint['identifier'] = contactPoint['id'];
				const author = _.find(targetRepoObj.rootDataset.author, (a) => a['@id'] === contactPoint['@id']);
				contactPoint['@id'] = `mailto:${contactPoint['email']}`
				if (author) {
					author['contactPoint'] = contactPoint;
				} else {
					// Add the contact point as a contributor
					const contactPointPerson = this.getPerson(metadata['contributor_data_manager'], "Person");
					contactPointPerson['contactPoint'] = contactPoint;
					targetRepoObj.rootDataset['contributor'] = [contactPointPerson];
				}
			}
			// Set the license
			targetRepoObj.rootDataset.license = this.getLicense(metadata);
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
				targetCrate.addContext(extraContext);
			}
			targetRepoObj.rootDataset["memberOf"] = rootCollection.rootDataset;
			await targetRepoObj.addToRepo();
		}

		private addHistory(targetRepoObj: any, metadata: Object, creator: Object, approver: Object) {
			// check if the creator and approver are in the author list, if not add them
			sails.log.verbose(`${this.logHeader} addHistory() -> adding creator and approver to the author list`);
			const people = _.concat(targetRepoObj.rootDataset.author, targetRepoObj.rootDataset.contributor);
			let creatorPerson =  _.find(people, (a) => a && a['email'] == creator['email']);
			let approverPerson = _.find(people, (a) => a && a['email'] == approver['email']);
			
			if (!creatorPerson) {
				creatorPerson = this.getPerson(creator, "Person");
				targetRepoObj.crate.addEntity(creatorPerson);
			} 
			if (!approverPerson) {
				approverPerson = this.getPerson(approver, "Person");
				targetRepoObj.crate.addEntity(approverPerson);
			}
			// add the history entries
			sails.log.verbose(`${this.logHeader} addHistory() -> adding history entries`);
			targetRepoObj.crate.addEntity({
				'@id': 'history1',
				'@type': 'CreateAction',
				'name': 'Create',
				'description': 'Data record created',
				'endTime': targetRepoObj.rootDataset.dateCreated,
				'object': {'@id': targetRepoObj.crate.rootId},
				'agent': {'@id': creatorPerson['@id']}
			});
			targetRepoObj.crate.addEntity({
				'@id': 'history2',
				'@type': 'UpdateAction',
				'name': 'Publish',
				'endTime': targetRepoObj.rootDataset.datePublished,
				'object': {'@id': targetRepoObj.crate.rootId},
				'agent': {'@id': approverPerson['@id']}
			});
		}

		private addSubjects(targetRepoObj: any, metadata: Object, extraContext: Object) {
			sails.log.verbose(`${this.logHeader} addSubjects() -> adding subjects to the dataset`);
			const subjects = [];
			for (let subjectField of sails.config.datapubs.metadata.subjects) {
				const fieldVals = _.isArray(metadata[subjectField]) ? metadata[subjectField] : [metadata[subjectField]];
				sails.log.verbose(`${subjectField} -> fieldVal: ${JSON.stringify(fieldVals)}`);
				if (!_.isEmpty(fieldVals)) {
					for (let fieldVal of fieldVals) {
						if (!_.isEmpty(fieldVal)) {
							const id = `${sails.config.datapubs.metadata.DEFAULT_IRI_PREFS['about'][subjectField]}${fieldVal['notation']}`;
							const subject = {
								'@id': id,
								'@type': 'StructuredValue',
								'url': id,
								'identifier': id,
								'name': fieldVal['name'] 
							};
							subjects.push(subject);
						}
					}
				}
			}
			targetRepoObj.rootDataset['about'] = subjects;
		}

		private addFunders(targetRepoObj: any, metadata: Object, extraContext: Object) {
			sails.log.verbose(`${this.logHeader} addFunders() -> adding funders to the dataset`);
			let funders = [];
			for (let fundingField of sails.config.datapubs.metadata.funders) {
				const fieldVals = _.isArray(metadata[fundingField]) ? metadata[fundingField] : [metadata[fundingField]];
				sails.log.verbose(`${fundingField} -> fieldVal: ${JSON.stringify(fieldVals)}`);
				
				for (let fieldVal of fieldVals) {
					if (!_.isEmpty(fieldVal) && !_.isEmpty(_.get(fieldVal, 'dc_identifier[0]'))) {
						const id = `${sails.config.datapubs.metadata.DEFAULT_IRI_PREFS['funder']}${fieldVal['dc_identifier'][0]}`;
						const funder = {
							'@id': id,
							'@type': 'Organization',
							'name': fieldVal['dc_title'],
							'identifier': id
						};
						funders.push(funder);
					}
				}
			}
			targetRepoObj.rootDataset['funder'] = funders;
		}

		private addTemporalCoverage(targetRepoObj: any, metadata: Object, extraContext: Object) {
			sails.log.verbose(`${this.logHeader} addTemporalCoverage() -> adding temporal coverage to the dataset`);
			var tc = '';
			if( metadata['startDate'] ) {
				tc = metadata['startDate'];
				if( metadata['endDate'] ) {
					tc += '/' + metadata['endDate'];
				}
			} else if ( metadata['endDate'] ) {
				tc = metadata['endDate'];
			}
			if( metadata['timePeriod'] ) {
				if( tc ) {
					tc = tc + '; ' + metadata['timePeriod'];
				} else {
					tc = metadata['timePeriod'];
				}
			}
			if (!_.isEmpty(tc)) {
				targetRepoObj.rootDataset.temporalCoverage = tc;
			}
		}

		private addSpatialCoverage(targetRepoOjb: any, metadata: Object, extraContext: Object) {
			sails.log.verbose(`${this.logHeader} addSpatialCoverage() -> adding spatial coverage to the dataset`);
			if (metadata['geospatial']) {
				if (_.isEmpty(extraContext['Geometry'])) {
					extraContext['Geometry'] =  "http://www.opengis.net/ont/geosparql#Geometry";
					extraContext['asWKT'] = "http://www.opengis.net/ont/geosparql#asWKT";
				}
				let geospatial = metadata['geospatial'];
				sails.log.verbose(`spatialCoverage -> ${JSON.stringify(geospatial)}`);
				if (!_.isArray(geospatial)) {
					geospatial = [geospatial];
				}
				// COmmenting out the "proper way" of GEOMETRYCOLLECTION as it doesn't show up in the UI!
				const convertedGeoJson = _.map(geospatial, (geoJson, idx) => {
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
				targetRepoOjb.rootDataset.spatialCoverage = convertedGeoJson;
			} else {
				sails.log.verbose(`No geospatial field found in metadata`);
			}
		}

		private convertToWkt(id: string, geoJsonSrc:any) {
			let geoJson = _.cloneDeep(geoJsonSrc);
			_.unset(geoJson, '@type');
			const wkt = convertToWK(geoJson);
			sails.log.verbose(`Converted WKT -> ${wkt}`);
			return {
				"@id": id,
				"@type": "Geometry",
				"asWKT": wkt
			};
		}

		private addRelatedWorks(targetRepoObj: any, metadata: Object) {
			for (let relatedFieldConf of sails.config.datapubs.metadata.related_works) {
				let relatedWorks = [];
				const fieldVals = _.isArray(metadata[`related_${relatedFieldConf.field}`]) ? metadata[`related_${relatedFieldConf.field}`] : [metadata[`related_${relatedFieldConf.field}`]];
				sails.log.verbose(`related_${relatedFieldConf.field} -> fieldVal: ${JSON.stringify(fieldVals)}`);
				
				for (let fieldVal of fieldVals) {
					if (!_.isEmpty(fieldVal) && !_.isEmpty(fieldVal['related_url'])) {
						const relatedWork = {
							'@id': fieldVal['related_url'],
							'@type': relatedFieldConf.type,
							'name': fieldVal['related_title'],
							'identifier': fieldVal['related_url']
						};
						if (!_.isEmpty(fieldVal.related_notes)) {
							relatedWork['description'] = fieldVal.related_notes;
						}
						relatedWorks.push(relatedWork);
					}
				}
				targetRepoObj.rootDataset[relatedFieldConf.field] = relatedWorks;
			}
		}

		private async addFiles(targetRepoObj: any, record: Object, attachments: any[]) {
			for (let a of attachments) {
				const fileAttMetaPart = {
					"name": a['name'],
					"@id": a['name'],
					"@type": ["File"],
					"encodingFormat": mime.lookup(a['name'])
				};
				await targetRepoObj.addFile(fileAttMetaPart, a['parentDir'], a['name']);
			}
		}

		private getLicense(metadata: Object): Object {
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
				licenses.push(sails.config.datapubs.rootCollection.defaultLicense);
			}
			return licenses;
		}

		private getCreators(metadata: Object, organization: Object): Object[] {
			let creators = [];
			if (metadata['creators']) {
				creators = _.compact(metadata['creators'].map((creator) => {
					 const person = this.getPerson(creator, "Person");
					 if (person) {
						 person['affiliation'] = organization;
						 return person;
					 }
				}));
			}
			return creators;
		}

		private getPerson(rbPerson: Object, type:string): Object {
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

		private getYearFromDate(dateString):string {
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

		private async writeToFileUsingStream(filePath: string, inputStream: any): Promise<void> {
			const writeStream = createWriteStream(filePath);
	    inputStream.pipe(writeStream);
  	  await finished(writeStream); // Wait for the stream to finish
		}

		// writeDatastream works for new redbox-storage -- using sails-hook-redbox-storage-mongo.

		private async writeDatastream(stream: any, dir: string, fn: string) {
			await this.ensureDir(dir);
			await this.writeToFileUsingStream(path.join(dir, fn), stream);
		}

		private async recordPublicationError(oid: string, record: Object, err: Error): Promise<any> {
			const branding = sails.config.auth.defaultBrand;
			// turn off postsave triggers
			sails.log.verbose(`${this.logHeader} recordPublicationError() -> recording publication error in record metadata`);
			record['metadata']['publication_error'] = "Data publication failed with error: " + err.name + " " + err.message;
			await RecordsService.updateMeta(branding, oid, record, null, true, false);
		}

	}

}

module.exports = new Services.OniService().exports();
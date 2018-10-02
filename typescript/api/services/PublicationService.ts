// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { Observable } from 'rxjs/Rx';
import services = require('../core/CoreService.js');
import { Sails, Model } from "sails";
import 'rxjs/add/operator/toPromise';
import * as request from "request-promise";
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';
import path = require('path');

declare var sails: Sails;
declare var RecordsService;

// Note: onNotifySuccess doesn't work as simply as I hoped, the method calling 
// it has to explicitly look for it

export module Services {
  /**
   *
   * a Service to extract a DataPub and put it in a DataCrate with the
   * metadata crosswalked into the right JSON-LD
   *
   * @author <a target='_' href='https://github.com/spikelynch'>Mike Lynch</a>
   *
   */
  export class DataPublication extends services.Services.Core.Service {

  	protected _exportedMethods: any = [
  		'exportDataset'
  	];



  	public exportDataset(oid, record, options): Observable<any> {
  		sails.log.info("!exportDataset! " + oid);
   		if( this.metTriggerCondition(oid, record, options) === "true") {

   			sails.log.info("Called exportDataset on update");
      	sails.log.info("oid: " + oid);
      	sails.log.info("options: " + JSON.stringify(options));
				const sitedir = sails.config.datapubs.sites[options['site']];
				if( ! sitedir ) {
					sails.log.error("Unknown publication site " + options['site']);
					return Observable.of(null);
				}

				const md = record['metadata'];

				const drec = md['dataRecord'];
				const drid = drec ? drec['oid'] : undefined;

				if( ! drid ) {
					sails.log.error("Couldn't find dataRecord or id for data pub " + oid);
					sails.log.info(JSON.stringify(record));
					return Observable.of(null)
				}

				sails.log.info("Got data record: " + drid);

				const attachments = md['dataLocations'].filter(
					(a) => a['type'] === 'attachment'
				);

				const dir = path.join(sitedir, oid);
				try {

					sails.log.info("making dataset dir: " + dir);
					fs.mkdirSync(dir);
				} catch(e) {
					sails.log.error("Couldn't create dataset dir " + dir);
					sails.log.error(e.name);
					sails.log.error(e.message);
					sails.log.error(e.stack);
					return Observable.of(null);
				}
				
				sails.log.info("Going to write attachments");
				
				// build a list of observables, each of which writes out an
				// attachment

				const obs = attachments.map((a) => {
					sails.log.info("building attachment observable " + a['name']);
					return RecordsService.getDatastream(drid, a['fileId']).
						flatMap(ds => {
							const filename = path.join(dir, a['name']);
							sails.log.info("about to write " + filename);
							return Observable.fromPromise(this.writeDatastream(ds, filename))
								.catch(error => {
									sails.log.error("Error writing attachment " + a['fileId']);
									sails.log.error(e.name);
									sails.log.error(e.message);
								});
						});
				});

				return Observable.merge(...obs)
					.flatMap((dummy) => {
						sails.log.info("One last part of the pipeline");
						return Observable.of({});
					});
					// .subscribe(response => {
					// 	sails.log.info("exportDataset response: " + JSON.stringify(response));
					// 	return Observable.of({});
					// },
					// error => {
					// 	sails.log.error("Error writing attachments");
					// 	sails.log.error(e.name);
					// 	sails.log.error(e.message);
					// 	return Observable.of(null);
					// },
					// () => {
					// 	sails.log.info("exportDataset (): " + JSON.stringify(response));
					// 	return Observable.of({});
					// }
    	} else {
     		sails.log.info(`Not sending notification log for: ${oid}, condition not met: ${_.get(options, "triggerCondition", "")}`)
    		return Observable.of(null);
   		}
  	}


		private writeDatastream(stream: Readable, fn: string): Promise<boolean> {
  		var wstream = fs.createWriteStream(fn);
  		sails.log.info("in writeDatastream " + fn);
  		stream.pipe(wstream);
  		return new Promise<boolean>( (resolve, reject) => {
    		wstream.on('finish', () => { resolve(true) }); 
    		wstream.on('error', reject);
  		});
		}	

	}

}

module.exports = new Services.DataPublication().exports();

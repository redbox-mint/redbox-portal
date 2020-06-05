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

declare var module;
declare var sails;
import {Observable} from 'rxjs/Rx';
import skipperGridFs = require('skipper-gridfs');
declare var _;

declare var BrandingService, WorkspaceTypesService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../core/CoreController.js');

export module Controllers {
	/**
	 * WorkspaceType related methods
	 *
	 * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
	 */
	export class WorkspaceTypes extends controller.Controllers.Core.Controller {

		private uriCreds: string = `${sails.config.datastores.mongodb.user}${_.isEmpty(sails.config.datastores.mongodb.password) ? '' : `:${sails.config.datastores.mongodb.password}`}`;
		private uriHost: string = `${sails.config.datastores.mongodb.host}${_.isNull(sails.config.datastores.mongodb.port) ? '' : `:${sails.config.datastores.mongodb.port}`}`;
		private mongoUri: string = `mongodb://${_.isEmpty(this.uriCreds) ? '' : `${this.uriCreds}@`}${this.uriHost}/${sails.config.datastores.mongodb.database}`;
		private blobAdapter = skipperGridFs({
			uri: this.mongoUri
		});

		protected _exportedMethods: any = [
			'get',
			'getOne',
			'uploadLogo',
			'renderImage',
			'getAvailableWorkspaces'
		];

		public bootstrap() {
		}

		public get(req, res) {
			const brand = BrandingService.getBrand(req.session.branding);
			return WorkspaceTypesService.get(brand).subscribe(response => {
				let workspaceTypes = [];
				if (response) {
					workspaceTypes = response.slice();
				}
				this.ajaxOk(req, res, null, {status: true, workspaceTypes: workspaceTypes});
			}, error => {
				const errorMessage = 'Cannot get workspace types';
				this.ajaxFail(req, res, error, errorMessage);
			});
		}

		public getOne(req, res) {
			const name = req.param('name');
			const brand = BrandingService.getBrand(req.session.branding);
			return WorkspaceTypesService.getOne(brand, name)
				.subscribe(response => {
					let workspaceType = null;
					if (response) {
						workspaceType = response;
					}
					this.ajaxOk(req, res, null, {status: true, workspaceType: workspaceType});
				}, error => {
					const errorMessage = 'Cannot get workspace types';
					this.ajaxFail(req, res, error, errorMessage);
				});
		}

		//May be irrelevant because the logo upload should be done at bootstrap.
		uploadLogo(req, res) {
			req.file('logo').upload({
				adapter: this.blobAdapter
			}, function (err, filesUploaded) {
				if (err) this.ajaxFail(req, res, err);
				this.ajaxOk(req, res, null, {status: true});
			});
		}

		public renderImage(req, res) {
			const type = req.param('workspaceType');
			const brand = BrandingService.getBrand(req.session.branding);
			return WorkspaceTypesService.getOne(brand, type).subscribe(response => {
				this.blobAdapter.read(response.logo, function (error, file) {
					if (error) {
						sails.log.warn("There was an error rending image for workspace controller. Sending back image from default image location...");
						res.sendFile(sails.config.appPath + `assets/images/${sails.config.static_assets.logoName}`);
					} else {
						res.contentType(`image/${sails.config.static_assets.imageType}`);
						res.send(new Buffer(file));
					}
				});
			});
		}

		getAvailableWorkspaces(req, res) {
			const workspaces = sails.config.workspaces.available;
			this.ajaxOk(req, res, null, { status: true, workspaces: workspaces });
		}
	}
}

module.exports = new Controllers.WorkspaceTypes().exports();

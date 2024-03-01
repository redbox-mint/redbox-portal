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
import { Input, Component, OnInit, Inject, Injector } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { RecordsService } from './records.service';
import { Map, GeoJSON, } from 'leaflet';
declare var omnivore: any;
declare var L: any;
declare var jQuery: any;
declare function require(name: string);

/**
 * Map Model
 *
 *
 * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
 *
 */
export class MapField extends FieldBase<any> {


  initialised: boolean = false;
  tabId: string;
  importDataString: string = "";

  layerGeoJSON: any = {};
  map: Map;
  importFailed: boolean = false;
  layers = [];
  drawnItems: any = new L.FeatureGroup();
  googleMaps = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    detectRetina: true
  });
  googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    detectRetina: true
  });
  coordinatesHelp?: any;
  kmlGeoJsonLabel: string;
  importButtonLabel: string;
  invalidDataMessage: string;

  MARKER_ICON_PATH = require('../../../assets/default/default/images/leaflet/marker-icon.png');
  MARKER_SHADOW_PATH = require('../../../assets/default/default/images/leaflet/marker-shadow.png');
  MARKER_RETINA_PATH = require('../../../assets/default/default/images/leaflet/marker-icon-2x.png');
  iconSettings = L.icon({
    iconSize: [25, 41],
    iconAnchor: [13, 41],
    iconUrl: this.MARKER_ICON_PATH,
    shadowUrl: this.MARKER_SHADOW_PATH
  });


  /*
  *
  * Draw options
  */
  /* Draw options that we do not want to be overridden by form config as it'll break functionality */
  masterDrawOptions: any = {
    edit: {
      featureGroup: this.drawnItems
    },
  };


  defaultDrawOptions: any = {
    position: 'topright',
    edit: {
      featureGroup: this.drawnItems
    },
    draw: {
      marker: {
        icon: this.iconSettings
      },
      circlemarker: false,
      circle: false
    }
  };

  drawOptions: any = this.defaultDrawOptions;

  /*
  *
  * Leaf options
  */
  masterLeafletOptions = {
    layers: [this.googleMaps, this.drawnItems],
  };

  defaultLeafletOptions = {
    zoom: 4,
    center: L.latLng([-24.673148, 134.074574])
  };

  leafletOptions: any = this.defaultLeafletOptions;

  layersControl = {
    baseLayers: {
      'Google Maps': this.googleMaps,
      'Google Hybrid': this.googleHybrid
    }
  };

  mainTabId: any;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.clName = 'MapField';
    //Workaround to overcome ERR_INVALID_URL error thrown when the base64 url is invalid and ends with ")marker-icon.png
    //that happens because of a known bug inside leaflet bundle that is a regex issue within _detectIconPath function
    //https://github.com/Leaflet/Leaflet/issues/4968
    //https://stackoverflow.com/questions/55928916/marker-in-leaflet-js-does-not-load-properly-due-to-err-invalid-url-error
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: this.MARKER_RETINA_PATH,
      iconUrl: this.MARKER_ICON_PATH,
      shadowUrl: this.MARKER_SHADOW_PATH
    });
    this.leafletOptions = options['leafletOptions'] || this.defaultLeafletOptions;
    // merge in master options to ensure we have the right layers configured
    this.leafletOptions = _.merge(this.leafletOptions, this.masterLeafletOptions);

    this.drawOptions = options['drawOptions'] || this.drawOptions;
    // merge in master options to ensure we have the right layers configured
    this.drawOptions = _.merge(this.drawOptions, this.masterDrawOptions);

    this.tabId = options['tabId'] || null;

    this.layerGeoJSON = options.value;
    this.mainTabId = options['mainTabId'] || null;
    this.coordinatesHelp = this.getTranslated(options.coordinatesHelp, undefined);
    this.kmlGeoJsonLabel = this.getTranslated(options.kmlGeoJsonLabel, "Enter KML or GeoJSON");
    this.importButtonLabel = this.getTranslated(options.importButtonLabel, "Import");
    this.invalidDataMessage = this.getTranslated(options.invalidDataMessage, "Entered text is not valid KML or GeoJSON");
  }

  onMapReady(map: Map) {

    this.map = map;

    let that = this;

    this.registerMapEventHandlers(map);
    this.setValue(this.layerGeoJSON);


    if (this.tabId === null) {
      if (this.visible) {
        map.invalidateSize();
        try {
          // if there are no layers present this will throw an error
          map.fitBounds(this.drawnItems.getBounds());
        } catch (e) {

        }
      }
    } else {
      if (this.editMode) {
        // Note: this assumes the tabId is unqiue in the page, which may not be when there are multiple tab layouts.
        jQuery('a[data-bs-toggle="tab"]').on('shown.bs.tab', (e) => {
          const curTabId = e.target.href.split('#')[1];
          if (curTabId == that.tabId) {
            that.initMap(map, that);
          }
        });
      } else {
        const field = this.fieldMap._rootComp.getFieldWithId(this.mainTabId, this.fieldMap._rootComp.fields);
        field.onAccordionCollapseExpand.subscribe((event) => {
          if (event.shown == true && event.tabId == that.tabId && !that.initialised) {
            that.initMap(map, that);
            that.initialised = true;
          }
        });
      }
    }
  }

  public initMap(map, that) {
    map.invalidateSize();

    try {
      // if there are no layers present this will throw an error
      map.fitBounds(this.drawnItems.getBounds());
    } catch (e) {

    }

  }

  registerMapEventHandlers(map: Map) {
    let that = this;
    map.on(L.Draw.Event.CREATED, function (e: any) {
      var type = e.layerType,
        layer = e.layer;
      that.layers.push(layer);
      that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
      that.setValue(that.layerGeoJSON);
      return false;
    });

    map.on('draw:edited', function (e: any) {
      let layers = e.layers;
      let that2 = that;
      layers.eachLayer(function (layer) {
        let layerIndex = _.findIndex(that2.layers, function (o) { return o._leaflet_id == layer._leaflet_id; });
        if (layerIndex == -1) {
          that2.layers.push(layer);
        } else {
          that2.layers[layerIndex] = layer;
        }

      });
    });

    map.on('draw:editstop', function (e: any) {
      that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
      that.setValue(that.layerGeoJSON);
    });

    map.on('draw:deletestop', function (e: any) {
      that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
      that.setValue(that.layerGeoJSON);
    });

    map.on('draw:deleted', function (e: any) {
      let layers = e.layers;
      let that2 = that;
      layers.eachLayer(function (layer) {
        _.remove(that2.layers, function (o) { return o._leaflet_id == layer._leaflet_id; });
      });
    });
  }


  drawLayers() {
    this.drawnItems.clearLayers();
    let geoJSONLayer: GeoJSON = L.geoJSON(this.layerGeoJSON);
    this.layers = [];
    let that = this;
    geoJSONLayer.eachLayer(layer => {
      layer.addTo(that.drawnItems);
      that.layers.push(layer);
    });
  }
  public setVisibility(data, eventConf: any = {}) {
    let that = this;
    super.setVisibility(data, eventConf);
    setTimeout(function () {
      if (that.visible) {
        that.initMap(that.map, that);
      }
    }, 100)
  }

  postInit(value: any) {
    if (!_.isEmpty(value)) {
      this.layerGeoJSON = value;
      this.drawLayers();
    }
  }

  createFormModel(valueElem: any = undefined): any {
    if (valueElem) {
      this.layerGeoJSON = valueElem;
    }

    this.formModel = new FormControl(this.layerGeoJSON || {});

    return this.formModel;
  }

  setValue(value: any, emitEvent: boolean = true) {
    if (!_.isEmpty(value)) {
      this.layerGeoJSON = value;
      this.drawLayers();
      this.formModel.patchValue(this.layerGeoJSON, { emitEvent: emitEvent, emitModelToViewChange: true });
      this.formModel.markAsTouched();
      this.formModel.markAsDirty();
    } else {
      this.setEmptyValue();
      this.drawnItems.clearLayers();
    }
  }

  setEmptyValue() {
    this.layerGeoJSON = {};
    return this.layerGeoJSON;
  }

  reactEvent(eventName: string, eventData: any, origData: any) {
    super.reactEvent(eventName, eventData, origData);
    if (!_.isEmpty(this.formModel.value)) {
      this.layerGeoJSON = this.formModel.value;
      this.drawLayers();
      this.formModel.patchValue(this.layerGeoJSON, { emitEvent: false });
      this.formModel.markAsTouched();
    }

  }

  importData() {
    if (this.importDataString.length > 0) {
      try {
        if (this.importDataString.indexOf("<") == 0) {
          //probably KML
          let parsedLayers = omnivore.kml.parse(this.importDataString);
          if (parsedLayers.getLayers().length == 0) {
            this.importFailed = true;
            return false;
          }
          let that = this;
          parsedLayers.eachLayer(layer => {
            layer.addTo(that.drawnItems);
            that.layers.push(layer);
            that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
            this.drawLayers();
            that.map.fitBounds(that.drawnItems.getBounds());
          });
          this.importDataString = "";
          this.importFailed = false;
        } else {
          let parsedLayers = L.geoJSON(JSON.parse(this.importDataString));
          let that = this;
          parsedLayers.eachLayer(layer => {
            layer.addTo(that.drawnItems);
            that.layers.push(layer);
            that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
            this.drawLayers();
            that.map.fitBounds(that.drawnItems.getBounds());
          });
          this.importDataString = "";
          this.importFailed = false;
        }
        this.layerGeoJSON = L.featureGroup(this.layers).toGeoJSON();
        this.setValue(this.layerGeoJSON);
      } catch (e) {
        this.importFailed = true;
      }

    }

    return false;
  }

}

declare var aotMode
// Setting the template url to a constant rather than directly in the component as the latter breaks document generation
let rbMapDataTemplate = './field-map.html';
if (typeof aotMode == 'undefined') {
  rbMapDataTemplate = '../angular/shared/form/field-map.html';
}

/**
* #### Map Component.
*
* Uses Leaflet.js to render a widget and the Leaflet.draw plugin to be able to select regions
*
* #### Usage
* ```
*  {
*   class: 'MapField',
*   compClass: 'MapComponent',
*   definition: {
*     name: 'geocoords',
*     label: '@dataRecord-coverage',
*     help: '@dataRecord-coverage',
*     tabId: 'coverage',
*     leafletOptions: {
*                      zoom: 3,
*                      center: latLng([108.94248962402342, 34.26516142452615)
*                     }
*     }
*   }
* ```
*
*| Property Name  | Description                                                                                                                                                                                                                                                                                                                       | Required | Default                                                                                                                                                                                                                                                                                  |
*|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
*| label          | The label to show above the component                                                                                                                                                                                                                                                                                             | No       *|                                                                                                                                                                                                                                                                                          |
*| help           | Help text                                                                                                                                                                                                                                                                                                                         | No       *|                                                                                                                                                                                                                                                                                          |
*| tabId          | The name of the tab the widget is placed, this is needed as Leaflet needs the map to be visible before the tiles can be loaded correctly. Leave empty if widget isn't placed in a tab.                                                                                                                                            | No       *|                                                                                                                                                                                                                                                                                          |
*| leafletOptions | The leaflet options object. See the [Leaflet's documentation](http://leafletjs.com/reference-1.3.0.html#map-option) for more information. Note: layers cannot be changed as other functionality depends on it being set as it is and will be overridden. Defaults to a map centred on Australia (if no elements are drawn on map) | No       | ```{zoom: 4, center:" latLng([-24.673148, 134.074574]) }```                                                                                                                                                                                                                              |
*| drawOptions    | The leaflet draw options object. See the [Leaflet Draw's documentation](https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#options) for more information. Note: the edit featureGroup cannot be changed as other functionality depends on it being set as it is and will be overridden.                         | No       | ```{position:"topright",draw:{marker:{icon:icon({iconSize:[25,41],iconAnchor:[13,41],iconUrl:"http://localhost:1500/default/rdmp/images/leaflet/marker-icon.png",shadowUrl:"http://localhost:1500/default/rdmp/images/leaflet/marker-shadow.png"})},circlemarker:false,circle:false}}``` |
*/
@Component({
  selector: 'rb-mapdata',
  templateUrl: './field-map.html'
})
export class MapComponent extends SimpleComponent {
  field: MapField;

  coordinatesHelpShow: boolean;

  ngAfterViewInit() {
    if (!this.field.editMode) {
      this.field.initMap(this.field.map, this.field);
    }
  }

  public toggleCoordinatesHelp() {
    this.coordinatesHelpShow = !this.coordinatesHelpShow;
  }
}

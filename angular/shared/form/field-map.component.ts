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
import * as _ from "lodash-es";
import { RecordsService } from './records.service';
import {  Map,  GeoJSON,   } from 'leaflet';
declare var omnivore: any;
declare var L: any;


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
  importFailed:boolean = false;
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
        icon: L.icon({
          iconSize: [25, 41],
          iconAnchor: [13, 41],
          iconUrl: 'http://localhost:1500/default/rdmp/images/leaflet/marker-icon.png',
          shadowUrl: 'http://localhost:1500/default/rdmp/images/leaflet/marker-shadow.png'
        })
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

  constructor(options: any, injector: any) {
    super(options, injector);
    this.clName = 'MapField';

    this.leafletOptions = options['leafletOptions'] || this.defaultLeafletOptions;
    // merge in master options to ensure we have the right layers configured
    this.leafletOptions = _.merge(this.leafletOptions, this.masterLeafletOptions);

    this.drawOptions = options['drawOptions'] || this.drawOptions;
    // merge in master options to ensure we have the right layers configured
    this.drawOptions = _.merge(this.drawOptions, this.masterDrawOptions);

    this.tabId = options['tabId'] || null;

    this.layerGeoJSON = options.value;
  }

  onMapReady(map: Map) {

    this.map = map;

    let that = this;

    this.registerMapEventHandlers(map);
    this.setValue(this.layerGeoJSON);


    if (this.tabId === null) {
      map.invalidateSize();
      map.fitBounds(this.drawnItems.getBounds());
    } else {
      if (this.editMode) {
        // TODO: need a better way to select the tab component
        this.fieldMap._rootComp.fields[0]["onTabChange"].subscribe(tabName => {
          if (tabName == this.tabId) {
            map.invalidateSize();
            if (!that.initialised) {
              try {
                // if there are no layers present this will throw an error
                map.fitBounds(this.drawnItems.getBounds());
              } catch (e) {

              }
              that.initialised = true;
            }
          }
        });

      } else {
        setTimeout(5000, function() { map.invalidateSize(); });
      }
    }
  }



  registerMapEventHandlers(map: Map) {
    let that = this;
    map.on(L.Draw.Event.CREATED, function(e: any) {
      var type = e.layerType,
        layer = e.layer;
      that.layers.push(layer);
      that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
      that.setValue(that.layerGeoJSON);
      return false;
    });

    map.on('draw:edited', function(e: any) {
      let layers = e.layers;
      let that2 = that;
      layers.eachLayer(function(layer) {
        let layerIndex = _.findIndex(that2.layers, function(o) { return o._leaflet_id == layer._leaflet_id; });
        if(layerIndex == -1) {
          that2.layers.push(layer);
        } else {
          that2.layers[layerIndex] = layer;
        }

      });
    });

    map.on('draw:editstop', function(e: any) {
      that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
      that.setValue(that.layerGeoJSON);
    });

    map.on('draw:deletestop', function(e: any) {
      that.layerGeoJSON = L.featureGroup(that.layers).toGeoJSON();
      that.setValue(that.layerGeoJSON);
    });

    map.on('draw:deleted', function(e: any) {
      let layers = e.layers;
      let that2 = that;
      layers.eachLayer(function(layer) {
        _.remove(that2.layers, function(o) { return o._leaflet_id == layer._leaflet_id; });
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

  setValue(value: any) {
    if (!_.isEmpty(value)) {
      this.layerGeoJSON = value;
      this.drawLayers();
      this.formModel.patchValue(this.layerGeoJSON, { emitEvent: false });
      this.formModel.markAsTouched();
    }
  }

  setEmptyValue() {
    this.layerGeoJSON = {};
    return this.layerGeoJSON;
  }

  importData() {
    if(this.importDataString.length > 0) {
      try {
      if(this.importDataString.indexOf("<") == 0) {
        //probably KML
        let parsedLayers = omnivore.kml.parse(this.importDataString);
        if(parsedLayers.getLayers().length == 0) {
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

}

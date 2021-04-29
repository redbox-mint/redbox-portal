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

import {EventEmitter, Injector, Output} from '@angular/core';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import {TranslationService} from '../translation-service';
import {UtilityService} from '../util-service';
import {Observable} from 'rxjs/Observable';

import * as _ from "lodash";

/**
 * Base class for dynamic form models...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export class FieldBase<T> {
  value: T;
  id: string;
  name: string;
  label: string;
  required: boolean;
  controlType: string;
  compClass: any;
  form: any;
  groupClasses: any;
  cssClasses: any;
  isGroup: boolean;
  hasGroup: boolean;
  hasLookup: boolean;
  options: any;
  groupName: string;
  hasControl: boolean;
  formModel: any;
  validationMessages: any;
  editMode: boolean;
  readOnly: boolean;
  help: any;
  translationService: TranslationService;
  defaultValue: any;
  marginTop: string;
  onChange: any; // custom configuration for each component, for dates: e.g. { 'setStartDate': ['name of pickers']}
  publish: any; // configuration for publishing events
  subscribe: any; // configuration for subscribing to events published by other components
  fieldMap: any;
  utilityService: UtilityService;
  injector: Injector;
  componentReactors: any[] = [];
  clName: string;
  visible: boolean;
  appConfig: any;
  visibilityCriteria: any;
  validators: any;
  requiredIfHasValue: any[];
  selectFor: string;
  defaultSelect: string;

  @Output() public onValueUpdate: EventEmitter<any> = new EventEmitter<any>();
  @Output() public onValueLoaded: EventEmitter<any> = new EventEmitter<any>();


  subscriptionData:any = {};

  constructor(options = {}, injector) {
    this.injector = injector;
    this.translationService = this.getFromInjector(TranslationService);
    this.setOptions(options);
    this.validators = null;
  }

  getFromInjector(token: any) {
    return this.injector.get(token);
  }

  setOptions(options: {
    value?: T,
    name?: string,
    id?: string,
    label?: string,
    required?: boolean,
    order?: number,
    controlType?: string,
    cssClasses?: any,
    groupName?: string,
    editMode?: boolean,
    readOnly?: boolean,
    help?: any,
    defaultValue?: any,
    selectFor?: string,
    defaultSelect?: string,
  } = {}) {
    this.value = this.getTranslated(options.value, undefined);
    this.name = options.name || '';
    this.id = options.id || '';
    this.label = this.getTranslated(options.label, '');
    if (options.selectFor && options.defaultSelect) {
      if (_.isArray(options.help)) {
        const newHelp = _.defaultTo(
          _.find(options.help, f => f.key === options.selectFor),
          _.find(options.help, f => f.key === options.defaultSelect)
        );
        options.help = newHelp.value;
      }
    }
    this.help = this.getTranslated(options.help, undefined);
    this.required = !!options.required;
    this.controlType = options.controlType || '';
    this.cssClasses = options.cssClasses || {}; // array of
    this.groupClasses = options['groupClasses'] || '';
    this.groupName = options.groupName || null;
    this.editMode = _.isUndefined(options.editMode) ? false : options.editMode;
    this.readOnly = _.isUndefined(options.readOnly) ? false : options.readOnly;
    this.onChange = options['onChange'] || null;
    this.publish = options['publish'] || null;
    this.subscribe = options['subscribe'] || null;
    this.visible = _.isUndefined(options['visible']) ? true : options['visible'];
    this.visibilityCriteria = options['visibilityCriteria'];
    this.requiredIfHasValue = options['requiredIfHasValue'] || [];

    if (this.groupName) {
      this.hasGroup = true;
    }
    this.options = options;
    this.hasControl = true;
    this.validationMessages = {};
    _.forOwn(options['validationMessages'] || {}, (messageKey, messageName) => {
      this.validationMessages[messageName] = this.getTranslated(messageKey, messageKey);
    });
    this.defaultValue = this.getTranslated(options.defaultValue, undefined);
    if ((_.isUndefined(this.value) || _.isEmpty(this.value)) && !_.isUndefined(this.defaultValue)) {
      this.value = this.defaultValue;
    }
  }

  getTranslated(key, defValue) {
    if (!_.isEmpty(key) && !_.isUndefined(key)) {
      if (_.isFunction(key.startsWith) && key.startsWith('@') && this.translationService) {
        return this.translationService.t(key);
      } else {
        return key;
      }
    } else {
      return defValue;
    }
  }

  get isValid() {
    if (this.form && this.form.controls) {
      return this.form.controls[this.name].valid;
    }
    return false;
  }

  public createFormModel(valueElem: any = null): any {
    if (valueElem) {
      this.value = valueElem;
    }
    if (this.required) {
      this.validators = Validators.required;
    }
    this.formModel = new FormControl(this.value || '', this.validators);
    return this.formModel;
  }

  /**
   * Creates a control group and populates field map with:
   *
   * fieldMap[name].control = the NG2 FormControl
   * fieldMap[name].field = the Field model (this)
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param  {any} group
   * @param  {any} fieldMap
   * @return {any}
   */
  public getGroup(group: any, fieldMap: any): any {
    this.fieldMap = fieldMap;
    let retval = null;
    _.set(fieldMap, `${this.getFullFieldName()}.field`, this);
    let control = this.createFormModel();
    _.set(fieldMap, `${this.getFullFieldName()}.control`, control);
    if (this.hasGroup && this.groupName) {
      if (group[this.groupName]) {
        group[this.groupName].addControl(this.name, control);
      } else {
        const fg = {};
        fg[this.name] = control;
        group[this.groupName] = new FormGroup(fg);
      }
      retval = group[this.groupName];
    } else {
      if (this.hasControl) {
        group[this.name] = control;
        retval = group[this.name];
      }
    }
    return retval;
  }

  public triggerValidation() {
    if (this.formModel) {
      this.formModel.markAsTouched();
      this.formModel.updateValueAndValidity({onlySelf: false, emitEvent: false});
    }
  }

  valueNotNull(data) {
    return !_.isNull(data) && (_.isArray(data) ? (!_.isNull(data[0])) : true);
  }

  public setupEventHandlers() {
    const publishConfig = this.publish;
    const subscribeConfig = this.subscribe;
    if (!_.isEmpty(this.formModel)) {

      if (!_.isEmpty(publishConfig)) {
        _.forOwn(publishConfig, (eventConfig, eventName) => {
          const eventSourceName = eventConfig.modelEventSource;
          let eventSource = eventSourceName ? this.formModel[eventSourceName] : null;
          if (!eventSource) {
            eventSource = this.getEventEmitter(eventSourceName, 'this');
            if (!eventSource) {
              // you only need a 'publish' config block doesn't have an eventEmitter...if you do, as in the case
              // of the TabOrAccordionContainer, a simple 'subscribe' block will do
              // create the event emitter so components and other things can hook and publish stuff
              // Note: you will need publishers and subcribers to be named, otherwise they'd get lost in the map
              this[eventSource] = new EventEmitter<any>();
            }
          }
          eventSource.subscribe((value: any) => {
            if (this.valueNotNull(value)) {
              let emitData = value;
              if (!_.isEmpty(eventConfig.fields)) {
                if (_.isArray(value)) {
                  emitData = [];
                  _.each(value, (v: any) => {
                    if (!_.isEmpty(v)) {
                      const item = {};
                      _.each(eventConfig.fields, (f: any) => {
                        _.forOwn(f, (src, tgt) => {
                          item[tgt] = _.get(v, src);
                        });
                      });
                      emitData.push(item);
                    }
                  });
                } else {
                  emitData = {};
                  if (!_.isEmpty(value)) {
                    _.each(eventConfig.fields, (f: any) => {
                      _.forOwn(f, (src, tgt) => {
                        emitData[tgt] = _.get(value, src);
                      });
                    });
                  }
                }
              }
              console.log(`Emitting data:`);
              console.log(emitData);
              this.emitEvent(eventName, emitData, value);
            }
          });

        });
      }
    }

    if (!_.isEmpty(subscribeConfig)) {

      _.forOwn(subscribeConfig, (subConfig, srcName) => {
        _.forOwn(subConfig, (eventConfArr, eventName) => {
          const eventEmitter = this.getEventEmitter(eventName, srcName);
          eventEmitter.subscribe((value: any) => {
            let curValue = value;
            let dataAsArray = false;
            _.each(eventConfArr, (eventConf: any) => {
              if (eventConf.dataAsArray) {
                // process the data as an array, setting one action will set all for this source component
                dataAsArray = true;
                return false;
              }
            });
            if (_.isArray(value) && !dataAsArray) {
              curValue = [];
              _.each(value, (v: any) => {
                let entryVal = v;
                _.each(eventConfArr, (eventConf: any) => {
                  // adding source of the event
                  eventConf.srcName = srcName;
                  const fn: any = _.get(this, eventConf.action);
                  if (fn) {
                    let boundFunction = fn;
                    if (eventConf.action.indexOf(".") == -1) {
                      boundFunction = fn.bind(this);
                    } else {
                      var objectName = eventConf.action.substring(0, eventConf.action.indexOf("."));
                      boundFunction = fn.bind(this[objectName]);
                    }
                    entryVal = boundFunction(entryVal, eventConf);
                  }
                });
                if (!_.isEmpty(entryVal)) {
                  curValue.push(entryVal);
                }
              });
            } else {
              _.each(eventConfArr, (eventConf: any) => {
                // adding source of the event
                eventConf.srcName = srcName;
                const fn: any = _.get(this, eventConf.action);
                if (fn) {
                  let boundFunction = fn;
                  if (eventConf.action.indexOf(".") == -1) {
                    boundFunction = fn.bind(this);
                  } else {
                    var objectName = eventConf.action.substring(0, eventConf.action.indexOf("."));
                    boundFunction = fn.bind(this[objectName]);
                  }
                  curValue = boundFunction(curValue, eventConf);
                }
              });
            }
            if (!_.isUndefined(curValue)) {
              // cascade the event instance wide if only there's a valid value
              this.reactEvent(eventName, curValue, value);
            }
          });
        });
      });
    }
  }

  protected getEventEmitter(eventName, srcName) {
    let eventEmitter = null;
    if (srcName == "this") {
      eventEmitter = _.get(this, eventName);
    } else if (srcName == "form") {
      eventEmitter = _.get(this.fieldMap['_rootComp'], eventName);
    } else {
      if(!_.isEmpty(this.fieldMap[srcName])) {
        eventEmitter = _.get(this.fieldMap[srcName].field, eventName);
      }
    }
    if (_.isEmpty(eventEmitter)) {
      console.warn(`Missing event emitter: '${srcName} -> ${eventName}' needed by '${this.name}'. Failing softly by creating an eventEmitter that will never fire. In some cases, this should be fine, however, if you're still on active development, verify your form configuration.`);
      eventEmitter = new EventEmitter<any>();
    }
    return eventEmitter;
  }

  public emitEvent(eventName: string, eventData: any, origData: any) {
    this[eventName].emit(eventData);
  }

  public reactEvent(eventName: string, eventData: any, origData: any) {
    this.value = eventData;
    if (this.formModel) {
      this.formModel.setValue(eventData, {onlySelf: true, emitEvent: false});
    }
    _.each(this.componentReactors, (compReact) => {
      compReact.reactEvent(eventName, eventData, origData, this);
    });
  }

  public setFieldMapEntry(fieldMap: any, fieldCompRef: any) {
    if (!_.isUndefined(this.name) && !_.isEmpty(this.name) && !_.isNull(this.name)) {
      _.set(fieldMap, `${this.getFullFieldName()}.instance`, fieldCompRef.instance);
    }
  }

  public getFullFieldName(name = null) {
    const fldName = `${name ? name : this.name}`;
    // console.log(`Using fldName: ${fldName}`);
    // console.log(this.fieldMap);
    return fldName;
  }

  public getControl(name = null, fieldMap = null) {
    return _.get(fieldMap ? fieldMap : this.fieldMap, `${this.getFullFieldName(name)}.control`);
  }

  public setValue(value: any, emitEvent: boolean = true) {
    this.value = value;
    this.formModel.setValue(value, {onlySelf: true, emitEvent: emitEvent});
  }

  public toggleVisibility() {
    this.visible = !this.visible;
  }

  private execVisibilityFn(data, visibilityCriteria) {
    let newVisible = this.visible;
    const fn: any = _.get(this, _.get(visibilityCriteria, 'action'));
    if (fn) {
      let boundFunction = fn;
      if (_.get(visibilityCriteria, 'action', '').indexOf(".") == -1) {
        boundFunction = fn.bind(this);
      } else {
        var objectName = _.get(visibilityCriteria, 'action', '').substring(0, _.get(visibilityCriteria, 'action', '').indexOf("."));
        boundFunction = fn.bind(this[objectName]);
      }
      if (_.get(visibilityCriteria, 'passCriteria') == true) {
        newVisible = boundFunction(data, visibilityCriteria) == "true";
      } else {
        newVisible = boundFunction(data) == "true";
      }
    }
    return newVisible;
  }

  public setVisibility(data, eventConf:any = {}) {
    let newVisible = this.visible;
    if (_.isArray(this.visibilityCriteria)) {
      // save the value of this data in a map, so we can run complex conditional logic that depends on one or more fields
      if (!_.isEmpty(eventConf) && !_.isEmpty(eventConf.srcName)) {
        this.subscriptionData[eventConf.srcName] = data;
      }
      // only run the function set if we have all the data...
      if (_.size(this.subscriptionData) == _.size(this.visibilityCriteria)) {
        newVisible = true;
        _.each(this.visibilityCriteria, (visibilityCriteria) => {
          const dataEntry = this.subscriptionData[visibilityCriteria.fieldName];
          newVisible = newVisible && this.execVisibilityFn(dataEntry, visibilityCriteria);
        });

      }
    } else
    if (_.isObject(this.visibilityCriteria) && _.get(this.visibilityCriteria, 'type') == 'function') {
      newVisible = this.execVisibilityFn(data, this.visibilityCriteria);
    } else {
      newVisible = _.isEqual(data, this.visibilityCriteria);
    }
    const that = this;
    setTimeout(() => {
      if (!newVisible) {
        if (that.visible) {
          // remove validators
          if (that.formModel) {
            that.formModel.clearValidators();
            that.formModel.updateValueAndValidity();
          }
        }
      } else {
        if (!that.visible) {
          // restore validators
          if (that.formModel) {
            that.formModel.setValidators(that.validators);
            that.formModel.updateValueAndValidity();
          }
        }
      }
      that.visible = newVisible;
    });
  }

  public replaceValWithConfig(val) {
    _.forOwn(this.appConfig, (configVal, configKey) => {
      val = val.replace(new RegExp(`@${configKey}`, 'g'), configVal);
    });
    return val;
  }

  public getConfigEntry(name, defValue) {
    return _.isUndefined(_.get(this.appConfig, name)) ? defValue : _.get(this.appConfig, name);
  }

  public publishValueLoaded() {
    this.onValueLoaded.emit(this.value);
  }

  setRequiredAndClearValueOnFalse(flag) {
    this.required = flag;
    if (flag) {
      this.validators = Validators.required;
      this.formModel.setValidators(this.validators);
    } else {
      if (_.isFunction(this.validators) && _.isEqual(this.validators, Validators.required)) {
        this.validators = null;
      }
      this.formModel.clearValidators();
      this.formModel.setValue(null);
      this.value = null;
    }
  }

  setRequired(flag) {
    this.required = flag;
    if (flag) {
      this.validators = Validators.required;
    } else {
      if (_.isFunction(this.validators) && _.isEqual(this.validators, Validators.required)) {
        this.validators = null;
      } else {
        _.remove(this.validators, (v) => {
          return _.isEqual(v, Validators.required);
        });
      }
    }
    if (this.validators) {
      this.formModel.setValidators(this.validators);
    } else {
      this.formModel.clearValidators();
    }
  }

  setRequiredIfDependenciesHaveValue(data) {
    let retVal = false;
    _.each(this.requiredIfHasValue, (name) => {
      const depVal = this.fieldMap._rootComp.getFieldValue(name);
      let hasVal = false;
      if (_.isArrayLike(depVal)) {
        hasVal = !_.isEmpty(depVal);
      } else {
        hasVal = !_.isUndefined(depVal) && !_.isNull(depVal);
      }
      retVal = retVal || hasVal;
    });
    this.setRequired(retVal);
  }

  //Default asyncLoadData function. No async load required so return empty Observable.
  asyncLoadData() {
    return Observable.of(null);
  }

  /**
   * Used for setting another property for fields
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   * @param  curValue
   * @param  config
   * @return
   */
  setAnotherProperty(curValue, config: any) {
    let propValue = curValue;
    if (!_.isEmpty(config.template)) {
      propValue = this.utilityService.runTemplate({value: propValue, field: this}, config);
    }
    _.set(this, config.propertyPath, propValue);
    return config.dontChangeValue ? this.value : curValue;
  }
}

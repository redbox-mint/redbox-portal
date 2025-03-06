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
import { Input, Component, OnInit, Inject, Injector, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { TreeComponent, TreeNode, ITreeOptions, ITreeState } from 'angular-tree-component';
import * as _ from "lodash";
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/operator/bufferTime';
import 'rxjs/add/operator/filter';


/**
 *  Vocab Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class TreeSelectorField extends FieldBase<any> {

  public disableCheckboxRegexEnabled:boolean;
  public disableCheckboxRegexPattern:string;
  public disableCheckboxRegexTestValue:string;
  public disableCheckboxRegexCaseSensitive: boolean;
  public disableExpandCollapseToggleByName: boolean;
  public skipLeafNodeExpandCollapseProcessing: number;
  public component:any;
  public treeNodes:any;
  public ccsClassName:string;
  public expandChildrenWhenParentSeclected:boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.value = options['value'] || this.setEmptyValue();
    this.disableCheckboxRegexEnabled = options['disableCheckboxRegexEnabled'] || false;
    this.disableCheckboxRegexPattern = options['disableCheckboxRegexPattern'] || "";
    this.disableCheckboxRegexTestValue = options['disableCheckboxRegexTestValue'] || "";
    this.disableCheckboxRegexCaseSensitive = options['disableCheckboxRegexCaseSensitive'] || true;
    this.disableExpandCollapseToggleByName = options['disableExpandCollapseToggleByName'] || false;
    this.skipLeafNodeExpandCollapseProcessing = options['skipLeafNodeExpandCollapseProcessing'] || 4;
    this.treeNodes = options['treeNodes'] || [];
    this.ccsClassName = options['cssClassName'] || 'tree-node-checkbox';
    this.expandChildrenWhenParentSeclected = options['expandChildrenWhenParentSeclected'] || false;
  }

  setValue(value: any, emitEvent: boolean = true) {
    this.formModel.setValue(value, { emitEvent: emitEvent, emitModelToViewChange: true });
    this.formModel.markAsTouched();
    this.formModel.markAsDirty();
  }

  setEmptyValue() {
    this.value = [];
    return this.value;
  }

  setSelected(item:any, flag) {
    const curVal = this.formModel.value;
    if (flag) {
      curVal.push(item);
    } else {
      _.remove(curVal, (entry:any) => {
        return entry.name == item.name;
      });
    }
    this.setValue(curVal);
  }

  public toggleVisibility() {
    this.visible = !this.visible;
    if(this.visible) {
      this.component.initialiseControl();
    }
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
            if(that['disableValidators'] != null && typeof(that['disableValidators']) == 'function') {
              that['disableValidators']();
            } else {
              that.formModel.clearValidators();
            }
            that.formModel.updateValueAndValidity();
          }
        }
      } else {
        if (!that.visible) {
          // restore validators
          if (that.formModel) {       
              if(that['enableValidators'] != null && typeof(that['enableValidators']) == 'function') {
                that['enableValidators']();
              } else {
                that.formModel.setValidators(that.validators);
              }
              that.formModel.updateValueAndValidity();
          }
        }
      }
      that.visible = newVisible;
      if(that.visible) {
        that.component.initialiseControl();
      }
    });
    if(eventConf.returnData == true) {
      return data;
    }
  }
}
/**
* Component utilising the tree selector widget
*
*/
@Component({
  selector: 'tree-selector',
  templateUrl: './field-tree-selector.html',
  styles: ['span.node-name { font-size: 300%; }']
})
export class TreeSelectorComponent extends SimpleComponent {
  field: TreeSelectorField;
  elementRef: ElementRef;
  treeData: any = [];
  @ViewChild('treeSelector') public treeSelector : TreeComponent;
  options: any;
  nodeEventSubject: Subject<any>;
  treeInitListener: any;
  expandNodeIds: any = [];
  readonly STATUS_INIT = 0;
  readonly STATUS_LOADING = 1;
  readonly STATUS_LOADED = 2;
  readonly STATUS_EXPANDING = 3;
  readonly STATUS_EXPANDED = 4;
  loadState: any;
  initialised:boolean = false;

  constructor(@Inject(ElementRef) elementRef: ElementRef) {
    super();
    this.elementRef = elementRef;
    this.treeData = [];

    //https://angular2-tree.readme.io/docs/options
    //nodeClass is a function useful for styling the nodes individually
    this.options = {
      useCheckbox: true,
      useTriState: false,
      // getChildren: this.getChildren.bind(this),
      scrollContainer: document.body.parentElement,
      nodeClass: () => {
        return this.field.ccsClassName;
      }
    };
    this.nodeEventSubject = new Subject<any>();
    this.loadState = this.STATUS_INIT;
  }

  public ngOnInit() {
    if (this.field.editMode) {
      this.field.component = this;
      this.field.componentReactors.push(this);
    }
  }

  public ngAfterViewInit() {
    setTimeout(() => {
      this.initialiseControl();
    });
  }
  
  initialiseControl() {
    if (!this.initialised && this.field.editMode && this.field.visible) {
      const that = this;
      if (this.loadState == this.STATUS_INIT) {
        this.loadState = this.STATUS_LOADING;
        if (_.isEmpty(that.treeData)) {
          that.treeData =  that.translateNodesAndChildren(that.field.treeNodes);
          that.loadState = that.STATUS_LOADED;
        }
        this.nodeEventSubject.bufferTime(1000)
        .filter(eventArr => {
          return eventArr.length > 0
        })
        .subscribe(eventArr => {
          this.handleNodeEvent(eventArr);
        });
        this.startTreeInit();
      }
    }
  }

  //This method is called when the record edit view is first loaded and sets state and expand nodes that have checkboxes selected
  protected startTreeInit() {
    this.treeInitListener = Observable.interval(1000).subscribe(()=> { 
      try {
        if (!_.isEmpty(this.expandNodeIds)) {
          this.expandNodes();
        } else if (!_.isEmpty(this.treeSelector.treeModel.getVisibleRoots()) && this.loadState == this.STATUS_LOADED) {
          this.loadState = this.STATUS_EXPANDING;
          this.updateTreeView(this);
          this.expandNodes();
        } else if (this.loadState == this.STATUS_EXPANDING) {
          this.treeInitListener.unsubscribe();
          this.loadState = this.STATUS_EXPANDED;
        }
        this.initialised = true;
      } catch (err) {
        //TODO: Visibility is set asynchronously so there's no guarantee that everything required is in the DOM when this code is run onInit (when using onFormLoaded setVisibility)
      }
    });
  }

  public onEvent(event) {
    switch(event.eventName) {
      case "select":
        if(!this.isSelectionValid(event.node)){
          break;
        }
        this.field.setSelected(this.getValueFromChildData(event.node), true);
        if(this.field.expandChildrenWhenParentSeclected) {
          if(!_.isEmpty(event.node.children)) {
            event.node.expand();
          }
        }
        break;
      case "deselect":
        this.field.setSelected(this.getValueFromChildData(event.node), false);
        if(this.field.expandChildrenWhenParentSeclected) {
          if(!_.isEmpty(event.node.children)) {
            event.node.collapse();
          }
        }
        break;
    }
  }

  protected handleNodeEvent(eventArr) {
    let event = eventArr[0];
    if (eventArr.length >= 2) {
      event = eventArr[1];
    }
    let currentState = this.getNodeSelected(event.node.id);

    switch(event.eventName) {
      case "nodeActivate":
        if (currentState == undefined) {
          if(!this.isSelectionValid(event.node)){
            currentState = false;
          } else {
            currentState = true;
          }
        } else {
          currentState = false;
        }
        this.updateSingleNodeSelectedState(event.node, currentState);
        break;
      case "nodeDeactivate":
        this.updateSingleNodeSelectedState(event.node, false);
        break;
    }

    if(!this.field.disableExpandCollapseToggleByName) {
      this.expandCollapseNode(event.node);
    }
  }

  protected updateSingleNodeSelectedState(node, state) {
    const nodeId = node.id;
    const curState = this.treeSelector.treeModel.getState();
    this.setNodeSelected(curState, nodeId, state);
    this.treeSelector.treeModel.setState(curState);
    this.treeSelector.treeModel.update();
    this.field.setSelected(this.getValueFromChildData(node), state);
  }

  public onNodeActivate(event: any) {
    this.nodeEventSubject.next(event);
  }

  public onNodeDeactivate(event: any) {
    this.nodeEventSubject.next(event);
  }

  //This method is called when the record edit view is first loaded populates expandNodeIds list
  public updateTreeView(that) {
    const state = that.treeSelector.treeModel.getState();
    that.expandNodeIds = [];
    _.each(that.field.value, (val) => {
      this.setNodeSelected(state, val.id, true);
      _.each(val.parent, (parent) => {
        if (!_.includes(that.expandNodeIds, parent.id)) {
          that.expandNodeIds.push(parent.id);
        }
      });
    });
    that.treeSelector.treeModel.setState(state);
    that.treeSelector.treeModel.update();
    that.expandNodeIds = _.sortBy(that.expandNodeIds, (o) => { return _.isString(o) ? o.length : 0 });
  }

  //Takes the first entry in expandNodeIds list and expands the node and the removed the id from the list 
  protected expandNodes() {
    if (!_.isEmpty(this.expandNodeIds)) {
      const parentId = this.expandNodeIds[0];
      const node = this.treeSelector.treeModel.getNodeById(parentId);
      if (node) {
        node.expand();
        _.remove(this.expandNodeIds, (id) => { return id == parentId });
      }
    }
  }

  protected expandCollapseNode(nodeEvent: any) {
    const nodeId = _.get(nodeEvent,'id','');
    console.log('expandCollapseNode '+nodeId);
    //Ignore expand collapse processing if id string value has length that exceeds default
    if(nodeId == '' || nodeId.length > this.field.skipLeafNodeExpandCollapseProcessing) {
      return;
    }

    const node = this.treeSelector.treeModel.getNodeById(nodeId);
    if (node) {
      if(_.get(node, 'isCollapsed', false)) {
        node.expand();
      } else {
        node.collapse();
      }
    }
  }

  protected collapseNodes() {
    this.treeSelector.treeModel.collapseAll();
  }

  protected setNodeSelected(state, nodeId, flag) {
    if (flag) {
      state.selectedLeafNodeIds[nodeId] = flag;
    } else {
      _.unset(state.selectedLeafNodeIds, nodeId);
    }
  }

  protected getNodeSelected(nodeId) {
    return this.treeSelector.treeModel.getState().selectedLeafNodeIds[nodeId];
  }

  protected clearSelectedNodes() {
    const state = this.treeSelector.treeModel.getState();
    state.selectedLeafNodeIds = {};
    this.treeSelector.treeModel.setState(state);
  }

  public translateNodesAndChildren(nodes: any[]) {
    let tNodes = [];
    for(let node of nodes) {
      let tChildren = [];
      let children = _.get(node,'children',[]);
      if(!_.isEmpty(children)) {
        for(let child of children) {
          let c = _.clone(child);
          let childName = _.get(child,'name','');
          let tName = this.field.getTranslated(childName,childName);
          _.set(c,'name',tName);
          tChildren.push(c);
        }
      }
      let i = _.clone(node);
      let nodeName = _.get(node,'name','');
      let tName = this.field.getTranslated(nodeName,nodeName);
      if(!_.isEmpty(tChildren)) {
        _.unset(i,'childen');
        _.set(i,'children',tChildren);
      }
      _.set(i,'name',tName);
      tNodes.push(i);
    }
    return tNodes;
  }

  public getValueFromChildData(childNode: any) {
    const data = childNode.data;
    const val = { id: data.id, name: `${data.name}`, type: `${data.type}`};
    this.setParentTree(val, childNode);
    return val;
  }

  public isSelectionValid(childNode: any) {
    let valid = true;
    if(this.field.disableCheckboxRegexEnabled) {
      const data = childNode.data;
      let nodeId = _.get(data,this.field.disableCheckboxRegexTestValue);
      let re; 
      if(this.field.disableCheckboxRegexCaseSensitive) {
        re = new RegExp(this.field.disableCheckboxRegexPattern);
      } else {
        re = new RegExp(this.field.disableCheckboxRegexPattern,'i');
      }
      if(!_.isUndefined(nodeId)) {
        let regexTest = re.test(nodeId.toString());
        console.log('nodeId ' + nodeId + ' testValue ' + this.field.disableCheckboxRegexTestValue + ' regexTest ' + regexTest);
        if(!regexTest) {
          valid = false;
        } 
      }
    }
    return valid;
  }

  public setParentTree(val:any, childNode: any) {
    const parent = _.get(childNode, 'parent.data');
    if (!_.isUndefined(parent) && !parent.virtual) {
      if (_.isUndefined(val['parent'])) {
        val['parent'] = [];
      }
      val['parent'].push({ id: parent.id, name: `${parent.name}`, type: `${parent.type}` });
      
    } else if (!_.isUndefined(val['parent'])) {
      val['parent'] = _.sortBy(val['parent']);
    }
  }

  public reactEvent(eventName: string, eventData: any, origData: any, elem:any) {
    this.collapseNodes();
    this.clearSelectedNodes();
    this.loadState = this.STATUS_LOADED;
    this.startTreeInit();
  }

  
}

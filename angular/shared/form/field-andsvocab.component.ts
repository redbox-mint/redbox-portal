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
import { ANDSService } from '../ands-service';
import { TreeComponent, TreeNode, ITreeOptions, ITreeState } from 'angular-tree-component';
import * as _ from "lodash";
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/operator/bufferTime';
import 'rxjs/add/operator/filter';

declare var jQuery: any;


/**
 *  Vocab Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class ANDSVocabField extends FieldBase<any> {

  public andsService:ANDSService;
  public vocabId:string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.value = options['value'] || this.setEmptyValue();
    this.vocabId  = options['vocabId'] || 'anzsrc-for';

    this.andsService = this.getFromInjector(ANDSService);
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
        return entry.notation == item.notation;
      });
    }
    this.setValue(curVal);
  }

}
/**
* Component utilising the ANDS Vocabb selector widget
*
*
*
*
*/
@Component({
  selector: 'ands-vocab-selector',
  templateUrl: './field-andsvocab.html',
  styles: ['span.node-name { font-size: 300%; }']
})
export class ANDSVocabComponent extends SimpleComponent {
  field: ANDSVocabField;
  elementRef: ElementRef;
  treeData: any = [];
  @ViewChild('andsTree') public andsTree : TreeComponent;
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

  constructor(@Inject(ElementRef) elementRef: ElementRef) {
    super();
    this.elementRef = elementRef;
    this.treeData = [];

    this.options = {
      useCheckbox: true,
      useTriState: false,
      getChildren: this.getChildren.bind(this),
      scrollContainer: document.body.parentElement
    };
    this.nodeEventSubject = new Subject<any>();
    this.loadState = this.STATUS_INIT;
  }

  public ngOnInit() {
    if (this.field.editMode) {
      jQuery(this.elementRef.nativeElement)['vocab_widget']({
        repository: this.field.vocabId,
        endpoint: 'https://vocabs.ands.org.au/apps/vocab_widget/proxy/',
        fields:["label", "notation", "about"],
        cache: false
      });
      this.field.componentReactors.push(this);
    }
  }

  public ngAfterViewInit() {
    if (this.field.editMode) {
      const that = this;
      if (this.loadState == this.STATUS_INIT) {
        this.loadState = this.STATUS_LOADING;
        jQuery(this.elementRef.nativeElement).on('top.vocab.ands', function(event, data) {
          if (_.isEmpty(that.treeData)) {
            that.treeData = that.mapItemsToChildren(data.items);
            that.loadState = that.STATUS_LOADED;
          }
        });
        jQuery(this.elementRef.nativeElement)['vocab_widget']('top');

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

  protected startTreeInit() {
    this.treeInitListener = Observable.interval(1000).subscribe(()=> {
      if (!_.isEmpty(this.expandNodeIds)) {
        this.expandNodes();
      } else if (!_.isEmpty(this.andsTree.treeModel.getVisibleRoots()) && this.loadState == this.STATUS_LOADED) {
        this.loadState = this.STATUS_EXPANDING;
        this.updateTreeView(this);
        this.expandNodes();
      } else if (this.loadState == this.STATUS_EXPANDING) {
        this.treeInitListener.unsubscribe();
        this.loadState = this.STATUS_EXPANDED;
      }
    });
  }

  public onEvent(event) {
    switch(event.eventName) {
      case "select":
        this.field.setSelected(this.getValueFromChildData(event.node), true);
        break;
      case "deselect":
        this.field.setSelected(this.getValueFromChildData(event.node), false);
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
          currentState = true;
        } else {
          currentState = false;
        }
        this.updateSingleNodeSelectedState(event.node, currentState);
        break;
      case "nodeDeactivate":
        this.updateSingleNodeSelectedState(event.node, false);
        break;
    }
  }

  protected updateSingleNodeSelectedState(node, state) {
    const nodeId = node.id;
    const curState = this.andsTree.treeModel.getState();
    this.setNodeSelected(curState, nodeId, state);
    this.andsTree.treeModel.setState(curState);
    this.andsTree.treeModel.update();
    this.field.setSelected(this.getValueFromChildData(node), state);
  }

  public onNodeActivate(event: any) {
    this.nodeEventSubject.next(event);
  }

  public onNodeDeactivate(event: any) {
    this.nodeEventSubject.next(event);
  }

  public updateTreeView(that) {
    const state = that.andsTree.treeModel.getState();
    that.expandNodeIds = [];
    _.each(that.field.value, (val) => {
      this.setNodeSelected(state, val.notation, true);
      _.each(val.geneaology, (parentId) => {
        if (!_.includes(that.expandNodeIds, parentId)) {
          that.expandNodeIds.push(parentId);
        }
      });
    });
    that.andsTree.treeModel.setState(state);
    that.andsTree.treeModel.update();
    that.expandNodeIds = _.sortBy(that.expandNodeIds, (o) => { return _.isString(o) ? o.length : 0 });
  }

  protected expandNodes() {
    if (!_.isEmpty(this.expandNodeIds)) {
      const parentId = this.expandNodeIds[0];
      const node = this.andsTree.treeModel.getNodeById(parentId);
      if (node) {
        node.expand();
        _.remove(this.expandNodeIds, (id) => { return id == parentId });
      }
    }
  }

  protected collapseNodes() {
    this.andsTree.treeModel.collapseAll();
  }

  protected setNodeSelected(state, nodeId, flag) {
    if (flag) {
      state.selectedLeafNodeIds[nodeId] = flag;
    } else {
      _.unset(state.selectedLeafNodeIds, nodeId);
    }
  }

  protected getNodeSelected(nodeId) {
    return this.andsTree.treeModel.getState().selectedLeafNodeIds[nodeId];
  }

  protected clearSelectedNodes() {
    const state = this.andsTree.treeModel.getState();
    state.selectedLeafNodeIds = {};
    this.andsTree.treeModel.setState(state);
  }

  public getChildren(node: any) {
    const that = this;
    const promise = new Promise((resolve, reject)=> {
      jQuery(this.elementRef.nativeElement).on('narrow.vocab.ands', function(event, data) {
        return resolve(that.mapItemsToChildren(data.items));
      });
    });
    jQuery(this.elementRef.nativeElement)['vocab_widget']('narrow', {uri: node.data.about});
    return promise;
  }

  public mapItemsToChildren(items: any[]) {
    return _.map(items, (item:any) => {
      return { id: item.notation, name: `${item.notation} - ${item.label}`, hasChildren:item.narrower && item.narrower.length > 0,  ...item }
    });
  }

  public getValueFromChildData(childNode: any) {
    const data = childNode.data;
    const val = { name: `${data.notation} - ${data.label}`,  label: data.label, notation: data.notation };
    this.setParentTree(val, childNode);
    return val;
  }

  public setParentTree(val:any, childNode: any) {
    const parentNotation = _.get(childNode, 'parent.data.notation');
    if (!_.isUndefined(parentNotation)) {
      if (_.isUndefined(val['geneaology'])) {
        val['geneaology'] = [];
      }
      val['geneaology'].push(parentNotation);
      if (childNode.parent.parent) {
        this.setParentTree(val, childNode.parent);
      }
    } else if (!_.isUndefined(val['geneaology'])) {
      val['geneaology'] = _.sortBy(val['geneaology']);
    }
  }

  public reactEvent(eventName: string, eventData: any, origData: any, elem:any) {
    this.collapseNodes();
    this.clearSelectedNodes();
    this.loadState = this.STATUS_LOADED;
    this.startTreeInit();
  }
}

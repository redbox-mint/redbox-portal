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
import { TreeModel, Ng2TreeSettings } from 'ng2-tree';
import { ANDSService } from '../ands-service';
import { TreeComponent, TreeNode, ITreeOptions, ITreeState } from 'angular-tree-component';
import * as _ from "lodash-es";

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
  initialisingTree: boolean = true;
  @ViewChild('andsTree') public andsTree : TreeComponent;
  options: any;

  constructor(@Inject(ElementRef) elementRef: ElementRef) {
    super();
    this.elementRef = elementRef;
    this.treeData = [];

    this.options = {
      useCheckbox: true,
      useTriState: false,
      getChildren: this.getChildren.bind(this)
    };
  }

  public ngOnInit() {
    if (this.field.editMode) {
      jQuery(this.elementRef.nativeElement)['vocab_widget']({
        repository: this.field.vocabId,
        endpoint: 'https://vocabs.ands.org.au/apps/vocab_widget/proxy/',
        fields:["label", "notation", "about"],
        cache: false
      });
    }
  }

  public ngAfterViewInit() {
    const that = this;
    if (this.initialisingTree) {
      jQuery(this.elementRef.nativeElement).on('top.vocab.ands', function(event, data) {
        if (_.isEmpty(that.treeData)) {
          that.treeData = that.mapItemsToChildren(data.items);
          that.updateTreeView();
          that.initialisingTree = false;
        }
      });
      jQuery(this.elementRef.nativeElement)['vocab_widget']('top');
      this.andsTree.treeModel.subscribeToState(this.onTreeState.bind(this));
    }
  }

  public onTreeState(state:ITreeState) {
    if (this.initialisingTree == false) {
      const selData = [];
      _.forOwn(state.selectedLeafNodeIds, (val, nodeId) => {
        selData.push(this.getValueFromChildData(this.andsTree.treeModel.getNodeById(nodeId)));
      });
      this.field.setValue(selData);
    }
  }

  public updateTreeView() {

    const state = {
      expandedNodeIds: {},
      selectedLeafNodeIds: {}
    };
    _.each(this.field.value, (val) => {
      state.selectedLeafNodeIds[val.notation] = true;
      _.each(val.geneaology, (parentId) => {
        state.expandedNodeIds[parentId] = true;
      });
    });
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
}

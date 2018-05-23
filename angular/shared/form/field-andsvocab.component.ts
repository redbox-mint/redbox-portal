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
import * as _ from "lodash-es";


/**
 *  Vocab Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class ANDSVocabField extends FieldBase<any> {
  public settings: Ng2TreeSettings = {
    rootIsVisible: false,
    showCheckboxes: true,
    cascadeCheckboxSelectToChildren: false
  };
  public tree: TreeModel = {
    value: 'Icons',
    children: [
    ]
  };

  public andsService:ANDSService;
  public vocabId:string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.value = options['value'] || this.setEmptyValue();
    this.vocabId  = options['vocabId'] || 'anzsrc-for';

    this.andsService = this.getFromInjector(ANDSService);
  }

  setValue(value: any, emitEvent: boolean = true) {
    _.remove(value, item => {
      if(item['about'] == "") {
        return true;
      }
    });


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
export class ANDSVocabComponent extends SimpleComponent implements AfterViewInit {
  field: ANDSVocabField;
  elementRef: ElementRef;
  andsWidget: any;
  callbackMap: any = {};
  topElements: any = [];
  treeData: any = [];
  narrowingArray:any = [];
  initialisingTree: boolean = true;
  childNodeMap: any = {};
  @ViewChild('andsTree') public andsTree;

  constructor(@Inject(ElementRef) elementRef: ElementRef) {
    super();
    this.elementRef = elementRef;
  }

  public ngOnInit() {
    if(this.field.editMode) {
    let that = this;
    jQuery(this.elementRef.nativeElement)['vocab_widget']({
      repository: this.field.vocabId,
      endpoint: 'https://vocabs.ands.org.au/apps/vocab_widget/proxy/',
      fields:["label", "notation", "about"],
      cache: false
    });

    jQuery(this.elementRef.nativeElement).on('narrow.vocab.ands', function(event, data) {
        if (that.initialisingTree) {
          if (data.items.length > 0) {
            let broader = data['items'][0]['broader'];
            let items = [];
            _.each(data.items, item => {
              let child = {};
              if (item.narrower && item.narrower.length > 0) {
                child['children'] = [{ value: "won't be displayed" }];
                child['loadChildren'] = function(callback) {
                  that.callbackMap[item.about] = callback;
                  jQuery(that.elementRef.nativeElement)['vocab_widget']('narrow', item.about);
                };
              }

              child['value'] = item.notation + " - " + item.label;
              child['id'] = item.about;
              child['item'] = item;
              if (that.childNodeMap[item.about]) {
                child['children'] = that.childNodeMap[item.about];
                that.childNodeMap = _.omit(that.childNodeMap, item.about);
              }
              items.push(child);
            });
            that.childNodeMap[broader] = items;
            that.field.andsService.getResourceDetails(broader, that.field.vocabId).then(data=> {
              if(data["result"]["primaryTopic"]["broader"]) {
                  jQuery(that.elementRef.nativeElement)['vocab_widget']('narrow', data["result"]["primaryTopic"]["broader"]);
                  that.narrowingArray.push( data["result"]["primaryTopic"]["broader"]);
              }
               that.narrowingArray = _.pull(that.narrowingArray, broader);
               if(that.narrowingArray.length == 0) {
                 that.initialisingTree = false;
                 that.buildTree();
               }
            })
          }
        } else {
          let items = [];
          if (data.items.length > 0) {
            let callback = that.callbackMap[data.items[0]['broader']];
            _.each(data.items, item => {
              let child = {};
              if (item.narrower && item.narrower.length > 0) {
                child['children'] = [{ value: "won't be displayed" }];
                child['loadChildren'] = function(callback) {
                  that.callbackMap[item.about] = callback;
                  jQuery(that.elementRef.nativeElement)['vocab_widget']('narrow', item.about);
                };
              }
              child['value'] = item.notation + " - " + item.label;
              child['id'] = item.about;
              child['item'] = item;
              items.push(child);
            });
            callback(items);
          }
        }
      });

    jQuery(this.elementRef.nativeElement).on('top.vocab.ands', function(event, data) {
      if (that.field.value.length > 0) {
        that.treeData = data;
        let foundBroader = false;
        _.each(that.field.value, item => {
          if (item['broader']) {
            foundBroader = true;
            jQuery(that.elementRef.nativeElement)['vocab_widget']('narrow', item.broader);
            that.narrowingArray.push(item.broader);
          }
        });
        if(!foundBroader) {
          that.buildTree();
        }
      } else {
        that.treeData = data;
        that.buildTree();
      }
    });

    jQuery(this.elementRef.nativeElement)['vocab_widget']('top');
    }
  }

  buildTree() {
    var items = [];
    let that = this;
    _.each(this.treeData.items, item => {
      let child = {
        children: [{ value: "won't be displayed" }],

      };
      if (that.childNodeMap[item.about]) {
        child['children'] = that.childNodeMap[item.about];
        that.childNodeMap = _.omit(that.childNodeMap, item.about);
      } else {
        child['loadChildren'] = function(callback) {
          that.callbackMap[item.about] = callback;
          jQuery(that.elementRef.nativeElement)['vocab_widget']('narrow', item.about);
        }
      }
      child['value'] = item.notation + " - " + item.label;
      child['id'] = item.about;
      child['item'] = item;
      items.push(child);
    });
    this.initialisingTree = false;
    this.field.tree = {
      value: '',
      children: items,
      settings: {
        cssClasses: {
          expanded: 'fa fa-caret-down',
          collapsed: 'fa fa-caret-right',
          empty: 'fa fa-caret-right disabled',
          leaf: 'fa'
        }
      }
    };
  }

  ngAfterViewInit() {
    if(this.field.editMode) {
      _.each(this.field.value, item => {
        this.checkNode(item.about);
      });
    }
  }


  public checkNode(id: string): void {
    const treeController = this.andsTree.getControllerByNodeId(id);
    if (treeController) {
      treeController.check();
    } else {
      console.log(`Controller is absent for a node with id: ${id}`);
    }
  }

  handleSelected(event) {
    let node:any = event.node.node;

    if(_.findIndex(this.field.value, item => { return item['about'] == node.about;}) != -1) {
      this.field.value.push(node.item);
      this.field.setValue(this.field.value);
    }
    return false;
  }


  handleUnSelected(event) {
    let node = event.node.node;
    _.remove(this.field.value, element => {
      return element['about'] == node.item.about;
    });
    this.field.setValue(this.field.value);
  }

  controllerCreated(event) {
    let id = event.id;
    let controller = event.controller;

    if(_.findIndex(this.field.value, item => { return item['about'] == id;}) != -1) {
      window.setTimeout(function(){ controller.check(); }, 500)
    }

  }

}

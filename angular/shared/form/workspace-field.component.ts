import { Component, Input, Inject, ViewChild, ViewContainerRef, ComponentFactoryResolver, ComponentRef, ApplicationRef, ElementRef } from '@angular/core';
import { FieldBase } from './field-base';
import { FormControl, FormGroup, FormArray } from '@angular/forms';
import { SimpleComponent } from './field-simple.component';
import * as _ from "lodash";
import { WorkspaceTypeService } from '../workspace-service';

declare var jQuery: any;
declare var $: any;

/**
 * Base component for a Workspace field.
 *
 * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
 *
 */
@Component({
  selector: 'ws-field',
  template: '<span [attr.disabled]="isDisabled()" #field></span>'
})
export class WorkspaceFieldComponent {
  /**
   * The model for this field.
   */
  @Input() field: FieldBase<any>;

  /**
   * Form group
   */
  @Input() form: FormGroup;
  /**
   * The value of this field.
   */
  @Input() value: any;
  /**
   * Field map
   */
  @Input() fieldMap: any;
  /**
   * The DOM node for this field.
   */
  @ViewChild('field', {read: ViewContainerRef}) fieldAnchor: ViewContainerRef;

  /**
   * The parentId of this field
   */
  @Input() parentId: string;

  disabledExpression: string;

  @ViewChild('field') fieldElement;




  /**
  * Elements that were already disabled before we ran isDisabled (so they can be restored disabled)
  */
  private disabledElements: any;

  /**
   * For DI'ing...
   */
  constructor(@Inject(ComponentFactoryResolver) private componentFactoryResolver: ComponentFactoryResolver, protected app: ApplicationRef){
    this.disabledElements = [];
  }
  /**
   * If the form is valid.
   */
  get isValid() {
    if (this.form && this.form.controls) {
      return this.form.controls[this.field.name].valid;
    }
    return false;
  }

  /**
   *
   */
  public isDisabled() {

    var disabledExpression = this.field.options['disabledExpression'];
    if(disabledExpression != null) {

      var imports = this.fieldAnchor;
      var variables= {};
      variables['imports'] = this.fieldMap._rootComp;
      var compiled = _.template(disabledExpression, variables);
      var parentElement = jQuery(this.fieldElement.nativeElement.parentElement);
      if(compiled() == "true") {
        //take note of which elements where already disabled as we dont want to enable them if whole component becomes enabled again
        this.disabledElements = parentElement.find('*:disabled');
        parentElement.find('input').prop( "disabled", true );
        return 'disabled';
      } else {
        if(jQuery(this.fieldElement.nativeElement).prop('disabled') == 'disabled') {
          //previously disabled so lets re-enable
          parentElement.find('input').prop( "disabled", false );
          _.each(this.disabledElements, disabledElement => disabledElement.prop("disabled",true));
        }
        return null;
      }

    }
    return null;
  }

  /**
   * Change handler, instantiates the field component.
   */
  ngOnChanges() {
    if (!this.field || !this.componentFactoryResolver) {
      return;
    }
    this.fieldAnchor.clear();

    let compFactory = this.componentFactoryResolver.resolveComponentFactory(this.field.compClass);
    let fieldCompRef:ComponentRef<SimpleComponent> = <ComponentRef<SimpleComponent>> this.fieldAnchor.createComponent(compFactory, undefined, this.app['_injector']);
    fieldCompRef.instance.injector = this.app['_injector'];
    fieldCompRef.instance.field = this.field;
    fieldCompRef.instance.form = this.form;
    fieldCompRef.instance.fieldMap = this.fieldMap;
    fieldCompRef.instance.parentId = this.parentId;
    this.fieldMap[this.field.name].instance = fieldCompRef.instance;
  }
}

export class WorkspaceSelectorField extends FieldBase<any>  {
  workspaceApps: any[] = [];
  open: string;
  saveFirst: string;
  rdmp: string;
  workspaceTypeService: WorkspaceTypeService;
  workspaceApp: any;
  appLink: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.workspaceTypeService = this.getFromInjector(WorkspaceTypeService);
    this.open = this.getTranslated(options['open'], options['open']);
    this.saveFirst = this.getTranslated(options['saveFirst'], options['saveFirst']);
    this.rdmp = undefined;
    // this.options = options['options'] || [];
    this.workspaceApps = _.map(options['defaultSelection'] || [], (option) => {
      option['label'] = this.getTranslated(option['label'], option['label']);
      option['name'] = '';
      return option;
    });
    this.appLink = this.workspaceTypeService.getBrand() + '/record/';
    this.workspaceTypeService.getWorkspaceTypes().then(response => {
      if(response['status']) {
        //append results from database into workspaceApps
        this.workspaceApps = _.concat(this.workspaceApps, response['workspaceTypes']);
      } else {
        throw new Error('cannot get workspaces');
      }
    }).catch(error => {
      console.log(error);
    });
  }

  init() {
    this.rdmp = this.fieldMap._rootComp.oid || undefined;
  }

  registerEvents() {
    this.fieldMap._rootComp.recordCreated.subscribe(this.setOid.bind(this));
    this.fieldMap._rootComp.recordSaved.subscribe(this.setOid.bind(this));
  }

  setOid(o) {
    this.rdmp = o.oid;
  }


  loadWorkspaceDetails(value: string) {
    //GET me the value from the database
    if(!value){
      this.workspaceApp = null
    }else {
      this.workspaceApp = _.find(this.workspaceApps,
        function(w) {
          return w['name'] == value;
        }
      );
    }
  }

  createFormModel() {
    if (this.controlType == 'checkbox') {
      const fgDef = [];

      _.map(this.options, (opt:any)=>{
        const hasValue = _.find(this.value, (val:any) => {
          return val == opt.value;
        });
        if (hasValue) {
          fgDef.push(new FormControl(opt.value));
        }
      });
      // const fg = new FormArray(fgDef);
      // return fg;
      return new FormArray(fgDef);
    } else {
      // const model = super.createFormModel();
      // console.log(`Created form model:`);
      // console.log(model);
      // return model;
      return super.createFormModel();
    }
  }
}

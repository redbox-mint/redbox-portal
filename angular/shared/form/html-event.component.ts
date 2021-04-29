import { Component } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { NotInFormField } from './field-simple';
import * as _ from "lodash";
declare var jQuery: any;

/**
 * Handles low-level event handling. Warning: for data changes, etc. please use the field-level subscribe-publish model.
 *
 * Currently it allows lose coupling which events enable it. If you don't specify a custom 'subscribe' configuration, it will begin listening when the form loads.
 *
 * Specify an 'eventName' to handle, any of the following: https://html.spec.whatwg.org/multipage/webappapis.html#event-handlers-on-elements,-document-objects,-and-window-objects:event-beforeunload
 *
 * Has basic support for 'onbeforeload' event. Anything more complex than this will need to be wired via publish-subscribe pattern, for example when calling utility methods, service methods, form methods, etc.
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 * @param  options
 * @param  injector
 */
export class EventHandler extends NotInFormField {
  eventName: string;
  listening: boolean;
  handler: string;
  eventSource: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.eventName = options['eventName'];
    this.eventSource = _.isUndefined(options['eventSource']) ? 'window' : options['eventSource'];
  }

  public getGroup(group: any, fieldMap: any) : any {
    const retval = super.getGroup(group, fieldMap);
    // by now, we've got the fieldMap and can begin to listen to the form events if 'subscribe' is unspecified
    if (_.isEmpty(this.options.subscribe)) {
      this.getEventEmitter('onFormLoaded', 'form').subscribe((oid) => {
        this.start();
      });
    }
    return retval;
  }

  public start() {
    if (!this.listening) {
      this.listening = true;
      // sink our hooks into the event we're after...
      const that = this;
      const defHandler = (event) => {
        if (that.eventName == 'beforeunload' && that.eventSource == 'window') {
          that.fieldMap._rootComp.handleBeforeUnload(event);
        }
      };
      if (this.eventSource == 'window') {
        window.addEventListener(this.eventName, defHandler);
      } else {
        jQuery(this.eventSource).on(this.eventName, defHandler);
      }
    }
  }
}

@Component({
  selector: 'event-handler',
  template: `
  <!-- Event Handler placeholder. Nothing really to see here, move on. -->
  `,
})
export class EventHandlerComponent extends SimpleComponent {
  field: EventHandler;

}

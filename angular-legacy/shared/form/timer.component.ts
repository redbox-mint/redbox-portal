import { Component, Output,EventEmitter } from '@angular/core';
import { FieldBase } from './field-base';
import { RecordsService } from './records.service';
import { SimpleComponent } from './field-simple.component';
import { timer } from 'rxjs/observable/timer';
import * as _ from "lodash";

export class TimerField extends FieldBase<string> {
  @Output() public onPollingTick: EventEmitter<any> = new EventEmitter<any>();
  parameterName: string;
  timer:any = null;
  startPollingOnInit: boolean;
  runOnlyOnce: boolean;
  initialDelay: number | Date | undefined;
  pollingPeriod: number | undefined;
  subscription: any;
  pollingTickLimit: number;
  
  constructor(options: any, injector: any) {
    super(options, injector);
    
    this.parameterName = options.parameterName || '';
    this.initialDelay = _.get(options, 'initialDelay', 0);
    this.pollingPeriod = _.get(options, 'pollingPeriod', 10000);
    this.startPollingOnInit = _.get(options, 'startPollingOnInit', true);
    this.runOnlyOnce = _.get(options, 'startPollingOnInit', false);
    this.pollingTickLimit =  _.get(options, 'pollingTickLimit', 1000);
  }



  public startPolling(config:any = {}){
    this.subscription =this.timer.subscribe(pollingTick => {
      let oid = this.fieldMap._rootComp.oid;
      let emitData = {
        emitDate: new Date(),
        numberOfTicks: pollingTick,
        oid: oid
      }
      this.onPollingTick.emit(
        emitData
        );
      if(this.pollingTickLimit != 0 && pollingTick > this.pollingTickLimit) {
        this.subscription.unsubscribe();
      }
    })
  }

  public stopPolling(config:any = {}){
    this.subscription.unsubscribe();
  }

  initTimer() {
    if(this.runOnlyOnce) {
      this.timer = timer(this.initialDelay)
    } else {
      this.timer = timer(this.initialDelay,this.pollingPeriod)
    }
    
  }

}

@Component({
  selector: 'timer',
  template: `
  `,
})
export class TimerComponent extends SimpleComponent {
  field: TimerField;

  ngOnInit(){
    this.field.initTimer();
    if(this.field.startPollingOnInit) {
      this.field.startPolling();
    }
  }
}

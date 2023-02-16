import { Component, Inject, OnInit } from '@angular/core';
import { UtilityService, LoggerService, TranslationService, RecordService } from '@researchdatabox/redbox-portal-core';
import * as _ from 'lodash';

@Component({
  selector: 'dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  title = '@researchdatabox/dashboard';
  workflowSteps: any;

  wfSteps: any; 

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(RecordService) private recordService: RecordService
  ) {
   //do nothing
  }

  async ngOnInit() {
    this.loggerService.debug(`Export waiting for deps to init...`); 
    await this.utilService.waitForDependencies([this.translationService, this.recordService]);
    this.loggerService.debug(`Export initialised.`); 
    let wfSteps = await this.recordService.getWorkflowSteps('rdmp');
    this.workflowSteps = _.get(wfSteps, 'config.workflow.stageLabel');
    console.log(this.workflowSteps);
    this.loggerService.debug(this.workflowSteps);
  }

  async ngAfterViewInit() {
    await this.utilService.waitForDependencies([this.translationService, this.recordService]);
    this.wfSteps = this.recordService.getWorkflowSteps('rdmp');
  }
}



import {AppConfig} from './AppConfig.interface';

export class SystemMessage extends AppConfig {
      
      enabled: boolean = false;
      title: string;
    /**
     * The system message to display
     *
     * @type textarea
     */
      message:string;

      public static getFieldOrder(): string[] {
            return ["enabled", "title", "message"]
      }
  
}
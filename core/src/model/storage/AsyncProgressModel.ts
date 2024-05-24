import { BrandingModel } from "./BrandingModel";

export interface AsynchProgressModel {
    name: string;
    branding: BrandingModel; 
    date_started?: string; // 'datetime' type in Waterline corresponds to 'string' in TypeScript
    date_completed?: string; // 'datetime' type in Waterline corresponds to 'string' in TypeScript
    started_by: string;
    currentIdx?: number;
    targetIdx?: number;
    status?: string; // Assuming 'status' is a string
    message?: string; // Assuming 'message' is a string
    metadata?: {
        [key: string]: any;
    }; // Assuming 'metadata' is an object with any structure
    relatedRecordId?: string; // Assuming 'relatedRecordId' is a string identifier
    taskType?: string; // Assuming 'taskType' is a string
  }
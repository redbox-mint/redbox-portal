import { BrandingModel } from "./BrandingModel";

export interface CounterModel {
    name: string;
    branding: BrandingModel; 
    value: number;
}
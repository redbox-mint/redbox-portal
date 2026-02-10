import {RoleModel} from "./RoleModel";

export class BrandingModel {
    id: string = '';
    name: string = '';
    css: string = '';
    roles: RoleModel[] = [];
    supportAgreementInformation: SupportAgreementInformation = new SupportAgreementInformation();
}

export class SupportAgreementInformation {
    private readonly yearlyAgreements: Map<number, SupportAgreementYear>;

    constructor(initialAgreements: Record<number, SupportAgreementYear> = {}) {
        this.yearlyAgreements = new Map<number, SupportAgreementYear>();
        Object.entries(initialAgreements).forEach(([year, agreement]) => {
            const parsedYear = Number(year);
            if (!Number.isNaN(parsedYear)) {
                this.yearlyAgreements.set(parsedYear, {...agreement});
            }
        });
    }

    public setYear(year: number, agreedSupportDays: number, usedSupportDays: number = 0): void {
        this.yearlyAgreements.set(year, {agreedSupportDays, usedSupportDays});
    }

    public getYear(year: number): SupportAgreementYear {
        const agreement = this.yearlyAgreements.get(year);
        if (agreement) {
            return {...agreement};
        }
        return {agreedSupportDays: 0, usedSupportDays: 0};
    }

    public getAgreedSupportDays(year: number): number {
        return this.yearlyAgreements.get(year)?.agreedSupportDays ?? 0;
    }

    public getUsedSupportDays(year: number): number {
        return this.yearlyAgreements.get(year)?.usedSupportDays ?? 0;
    }

    public incrementUsedSupportDays(year: number, daysToAdd: number): SupportAgreementYear {
        const existing = this.yearlyAgreements.get(year) ?? {agreedSupportDays: 0, usedSupportDays: 0};
        const updated: SupportAgreementYear = {
            agreedSupportDays: existing.agreedSupportDays,
            usedSupportDays: existing.usedSupportDays + daysToAdd
        };
        this.yearlyAgreements.set(year, updated);
        return {...updated};
    }

    public getAllYears(): number[] {
        return Array.from(this.yearlyAgreements.keys()).sort((a, b) => a - b);
    }

    public toJSON(): Record<number, SupportAgreementYear> {
        const serialised: Record<number, SupportAgreementYear> = {};
        this.yearlyAgreements.forEach((value, key) => {
            serialised[key] = {...value};
        });
        return serialised;
    }
}

export interface SupportAgreementYear {
    agreedSupportDays: number;
    usedSupportDays: number;
}

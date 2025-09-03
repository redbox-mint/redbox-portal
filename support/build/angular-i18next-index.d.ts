import * as i18n from 'i18next';
import { FormatFunction } from 'i18next';
import { BehaviorSubject, Subject } from 'rxjs';
import * as i0 from '@angular/core';
import { Type, PipeTransform, ChangeDetectorRef, ModuleWithProviders, Provider, EnvironmentProviders, InjectionToken } from '@angular/core';
import { Title } from '@angular/platform-browser';
//import * as node_modules_i18next from 'node_modules/i18next';
import * as node_modules_i18next from 'i18next'

interface I18NextLoadResult {
    err: any;
    t?: Function;
}

interface I18NextErrorHandlingStrategy {
    handle(resolve: (thenableOrResult?: any) => void, reject: (error: any) => void): i18n.Callback;
}
declare class NativeErrorHandlingStrategy implements I18NextErrorHandlingStrategy {
    handle(resolve: (thenableOrResult?: I18NextLoadResult) => void, reject: (error: any) => void): (err: any, t?: Function) => void;
}
declare class StrictErrorHandlingStrategy implements I18NextErrorHandlingStrategy {
    handle(resolve: (thenableOrResult?: I18NextLoadResult) => void, reject: (error: any) => void): (err: any, t?: any) => void;
}

type ResourceEvent = {
    lng: any;
    ns: any;
};
type MissingKeyEvent = {
    lngs: any;
    namespace: any;
    key: any;
    res: any;
};
interface ITranslationEvents {
    initialized: BehaviorSubject<i18n.InitOptions | undefined>;
    loaded: BehaviorSubject<boolean>;
    failedLoading: Subject<any>;
    missingKey: Subject<MissingKeyEvent>;
    added: Subject<ResourceEvent>;
    removed: Subject<ResourceEvent>;
    languageChanged: BehaviorSubject<string | null>;
}

declare class I18NextEvents implements ITranslationEvents {
    initialized: BehaviorSubject<i18n.InitOptions<object> | undefined>;
    loaded: BehaviorSubject<boolean>;
    failedLoading: Subject<unknown>;
    missingKey: Subject<MissingKeyEvent>;
    added: Subject<ResourceEvent>;
    removed: Subject<ResourceEvent>;
    languageChanged: BehaviorSubject<string | null>;
}

interface I18NextModuleParams {
    errorHandlingStrategy?: Type<I18NextErrorHandlingStrategy>;
}

declare function defaultInterpolationFormat(value: any, format?: string, lng?: string): string;
declare function interpolationFormat(customFormat?: Function | null): FormatFunction;

type FormatPipeOptions = {
    format?: string;
    lng?: string;
    case?: string;
    [key: string]: any;
};
type PrependPipeOptions = {
    prependScope?: boolean;
    prependNamespace?: boolean;
};
type PipeOptions = i18n.TOptions & FormatPipeOptions & PrependPipeOptions;
type NamespaceResolver = (activatedRouteSnapshot: any, routerStateSnapshot?: any) => Promise<void>;

type Modify<T, R> = Omit<T, keyof R> & R;
type ITranslationOptions = i18n.TOptions;
type ITranslationService = Modify<Partial<i18n.i18n>, {
    events: ITranslationEvents;
    language: string;
    languages: readonly string[];
    options: i18n.InitOptions;
    modules: i18n.Modules;
    services: i18n.Services;
    store: i18n.ResourceStore;
    resolvedLanguage: string | undefined;
    use<T extends i18n.Module>(module: T | i18n.NewableModule<T> | i18n.Newable<T>): ITranslationService;
    init(options: i18n.InitOptions): Promise<I18NextLoadResult>;
    t<Options extends ITranslationOptions>(key: string | string[], options?: Options): i18n.TFunctionReturn<i18n.Namespace, string | string[], Options>;
    t<Options extends ITranslationOptions>(key: string | string[], defaultValue: string, options?: Options): i18n.TFunctionReturn<i18n.Namespace, string | string[], Options>;
    format: i18n.FormatFunction;
    exists: i18n.ExistsFunction;
    getFixedT(lng: string | readonly string[], ns?: string | readonly string[], keyPrefix?: string): i18n.TFunction;
    getFixedT(lng: null, ns: string | readonly string[] | null, keyPrefix?: string): i18n.TFunction;
    setDefaultNamespace(ns: string): void;
    dir(lng: string): string;
    changeLanguage(lng: string): Promise<any>;
    loadNamespaces(namespaces: string[]): Promise<any>;
    loadLanguages(lngs: string | readonly string[], callback?: i18n.Callback): Promise<void>;
    loadResources(callback?: (err: any) => void): void;
    getDataByLanguage(lng: string): {
        [key: string]: {
            [key: string]: string;
        };
    } | undefined;
    reloadResources(lngs?: string | readonly string[], ns?: string | readonly string[], callback?: () => void): Promise<void>;
    reloadResources(lngs: null, ns: string | readonly string[], callback?: () => void): Promise<void>;
    getResource(lng: string, ns: string, key: string, options?: Pick<i18n.InitOptions, 'keySeparator' | 'ignoreJSONStructure'>): any;
    addResource(lng: string, ns: string, key: string, value: string, options?: {
        keySeparator?: string;
        silent?: boolean;
    }): i18n.i18n;
    addResources(lng: string, ns: string, resources: any): i18n.i18n;
    addResourceBundle(lng: string, ns: string, resources: any, deep?: boolean, overwrite?: boolean): i18n.i18n;
    hasResourceBundle(lng: string, ns: string): boolean;
    getResourceBundle(lng: string, ns: string): any;
    removeResourceBundle(lng: string, ns: string): i18n.i18n;
}>;

declare class I18NextPipe implements PipeTransform {
    protected translateI18Next: ITranslationService;
    protected ns: string | string[];
    protected scope: string | string[];
    constructor(translateI18Next: ITranslationService, ns: string | string[], scope: string | string[]);
    transform(key: string | string[], options?: PipeOptions): string;
    private prependScope;
    private prependNamespace;
    private joinStrings;
    private keyContainsNsSeparator;
    private prepareOptions;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<I18NextPipe, "i18next", true>;
    static ɵprov: i0.ɵɵInjectableDeclaration<I18NextPipe>;
}

declare class I18NextEagerPipe extends I18NextPipe implements PipeTransform {
    protected translateI18Next: ITranslationService;
    protected ns: string | string[];
    protected scope: string | string[];
    private cd;
    private lastKey;
    private lastOptions;
    private lastValue;
    constructor(translateI18Next: ITranslationService, ns: string | string[], scope: string | string[], cd: ChangeDetectorRef);
    private hasKeyChanged;
    private hasOptionsChanged;
    transform(key: string | string[], options?: PipeOptions): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextEagerPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<I18NextEagerPipe, "i18nextEager", true>;
}

declare class I18NextCapPipe extends I18NextPipe implements PipeTransform {
    constructor(translateI18Next: ITranslationService, ns: string | string[], scope: string | string[]);
    transform(key: string | string[], options?: PipeOptions): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextCapPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<I18NextCapPipe, "i18nextCap", true>;
    static ɵprov: i0.ɵɵInjectableDeclaration<I18NextCapPipe>;
}

declare class I18NextFormatPipe implements PipeTransform {
    private translateI18Next;
    constructor(translateI18Next: ITranslationService);
    transform(value: any, options: FormatPipeOptions | string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextFormatPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<I18NextFormatPipe, "i18nextFormat", true>;
    static ɵprov: i0.ɵɵInjectableDeclaration<I18NextFormatPipe>;
}

/**
 * @deprecated Use provideI18Next() instead. This module-based approach will be removed in a future version.
 * Example:
 * ```typescript
 * // Instead of
 * imports: [I18NextModule.forRoot()]
 *
 * // Use
 * providers: [provideI18Next()]
 * ```
 */
declare class I18NextModule {
    /**
     * @deprecated Use provideI18Next() instead. This module-based approach will be removed in a future version.
     * Example:
     * ```typescript
     * // Instead of
     * imports: [I18NextModule.forRoot()]
     *
     * // Use
     * providers: [provideI18Next()]
     * ```
     */
    static forRoot(params?: I18NextModuleParams): ModuleWithProviders<I18NextModule>;
    static interpolationFormat(customFormat?: Function | null): FormatFunction;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextModule, never>;
    static ɵmod: i0.ɵɵNgModuleDeclaration<I18NextModule, never, [typeof I18NextPipe, typeof I18NextEagerPipe, typeof I18NextCapPipe, typeof I18NextFormatPipe], [typeof I18NextPipe, typeof I18NextEagerPipe, typeof I18NextCapPipe, typeof I18NextFormatPipe]>;
    static ɵinj: i0.ɵɵInjectorDeclaration<I18NextModule>;
}

/**
 * This function can trigger the loading of I18Next namespaces and block route activation to ensure namespaces are loaded before navigation continues.
 *
 * @param i18nextNamespaces I18Next namespaces to load
 * @returns A functional guard that will load the I18Next Namespaces, and continue navigation when loaded.
 */
declare const i18NextNamespacesGuard: (...i18nextNamespaces: string[]) => () => Promise<boolean>;

/**
 * A feature for use when configuring `provideI18Next`.
 *
 * @publicApi
 */
interface I18NextFeature<KindT extends I18NextFeatureKind> {
    ɵkind: KindT;
    ɵproviders: Provider[];
}
declare function makeI18NextFeature<KindT extends I18NextFeatureKind>(kind: KindT, providers: Provider[]): I18NextFeature<KindT>;
/**
 * Identifies a particular kind of `HttpFeature`.
 *
 * @publicApi
 */
declare enum I18NextFeatureKind {
    CustomErrorHandlingStrategy = 0,
    Mock = 1,
    Title = 2,
    AppInitialize = 3,
    SSR = 4,
    Forms = 5
}

declare function localeIdFactory(): string;
/**
 * Provides the necessary dependencies for using i18next with Angular.
 *
 * @param features An array of features to enable. See {@link I18NextFeature} for available features.
 * @returns An array of providers that can be added to the root providers.
 *
 * @example
 * import { provideI18Next } from '@angular-i18next/core';
 *
 *   providers: [
 *     provideI18Next(),
 *   ],
 *
 */
declare function provideI18Next(...features: I18NextFeature<I18NextFeatureKind>[]): EnvironmentProviders;
/**
 * Configures a custom error handling strategy for i18next.
 *
 * @param errorHandlingStrategy - A class implementing the I18NextErrorHandlingStrategy interface.
 * @returns An I18NextFeature for the specified custom error handling strategy.
 *
 * This feature allows the integration of a custom error handling mechanism
 * into the i18next setup, replacing the default error handling strategy.
 *
 *  * Example:
 * ```typescript
 *    providers: [
 *       provideI18Next(withCustomErrorHandlingStrategy(StrictErrorHandlingStrategy)())
 *    ]
 * ```
 */
declare function withCustomErrorHandlingStrategy(errorHandlingStrategy: Type<I18NextErrorHandlingStrategy>): I18NextFeature<I18NextFeatureKind.CustomErrorHandlingStrategy>;
/**
 * Provides I18NextTitle service for document title translation support.
 *
 * @returns An I18NextFeature that configures the I18NextTitle service
 *
 * Example:
 * ```typescript
 * providers: [
 *   provideI18Next(withTitle())
 * ]
 * ```
 */
declare function withTitle(): I18NextFeature<I18NextFeatureKind.Title>;

declare class I18NextTitle extends Title {
    private i18nextPipe;
    constructor(i18nextPipe: I18NextPipe, doc: any);
    setTitle(value: string): void;
    private translate;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextTitle, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<I18NextTitle>;
}

declare class I18NextService implements ITranslationService {
    private errorHandlingStrategy;
    private readonly i18next;
    events: ITranslationEvents;
    get language(): string;
    get languages(): readonly string[];
    get options(): i18n.InitOptions<object>;
    get modules(): node_modules_i18next.Modules;
    get services(): node_modules_i18next.Services;
    get store(): node_modules_i18next.ResourceStore;
    get resolvedLanguage(): string | undefined;
    get isInitialized(): boolean;
    constructor(errorHandlingStrategy: I18NextErrorHandlingStrategy, i18nextInstance?: i18n.i18n);
    t(key: string | string[], options?: ITranslationOptions | undefined): i18n.TFunctionReturn<i18n.Namespace, string | string[], ITranslationOptions>;
    t(key: string | string[] | (string | TemplateStringsArray)[], defaultValue: string, options?: ITranslationOptions | undefined): i18n.TFunctionReturn<i18n.Namespace, string | string[], ITranslationOptions>;
    use<T extends i18n.Module>(module: T | i18n.NewableModule<T> | i18n.Newable<T>): ITranslationService;
    init(options: i18n.InitOptions): Promise<I18NextLoadResult>;
    format(value: any, format?: string, lng?: string): string;
    exists(key: string | string[], options: any): boolean;
    getFixedT(lng: string | readonly string[], ns?: string | readonly string[], keyPrefix?: string): i18n.TFunction;
    getFixedT(lng: null, ns: string | readonly string[] | null, keyPrefix?: string): i18n.TFunction;
    setDefaultNamespace(ns: string): void;
    dir(lng?: string): "ltr" | "rtl";
    changeLanguage(lng: string): Promise<i18n.TFunction>;
    loadNamespaces(namespaces: string | string[]): Promise<any>;
    loadLanguages(lngs: string | string[]): Promise<void>;
    loadResources(callback?: (err: any) => void): void;
    getDataByLanguage(lng: string): {
        [key: string]: {
            [key: string]: string;
        };
    } | undefined;
    reloadResources(...params: any): Promise<void>;
    getResource(lng: string, ns: string, key: string, options: any): any;
    addResource(lng: string, ns: string, key: string, value: any, options: any): i18n.i18n;
    addResources(lng: string, ns: string, resources: any): i18n.i18n;
    addResourceBundle(lng: string, ns: string, resources: any, deep: any, overwrite: any): i18n.i18n;
    hasResourceBundle(lng: string, ns: string): boolean;
    getResourceBundle(lng: string, ns: string): any;
    removeResourceBundle(lng: string, ns: string): i18n.i18n;
    private subscribeEvents;
    static ɵfac: i0.ɵɵFactoryDeclaration<I18NextService, [null, { optional: true; }]>;
    static ɵprov: i0.ɵɵInjectableDeclaration<I18NextService>;
}

declare const I18NEXT_SCOPE: InjectionToken<string | string[]>;
declare const I18NEXT_NAMESPACE: InjectionToken<string | string[]>;
declare const I18NEXT_SERVICE: InjectionToken<ITranslationService>;
declare const I18NEXT_NAMESPACE_RESOLVER: InjectionToken<NamespaceResolver>;
declare const I18NEXT_ERROR_HANDLING_STRATEGY: InjectionToken<I18NextErrorHandlingStrategy>;
declare const I18NEXT_INSTANCE: InjectionToken<i18n.i18n>;

export { I18NEXT_ERROR_HANDLING_STRATEGY, I18NEXT_INSTANCE, I18NEXT_NAMESPACE, I18NEXT_NAMESPACE_RESOLVER, I18NEXT_SCOPE, I18NEXT_SERVICE, I18NextCapPipe, I18NextEagerPipe, I18NextEvents, I18NextFeatureKind, I18NextFormatPipe, I18NextModule, I18NextPipe, I18NextService, I18NextTitle, NativeErrorHandlingStrategy, StrictErrorHandlingStrategy, defaultInterpolationFormat, i18NextNamespacesGuard, interpolationFormat, localeIdFactory, makeI18NextFeature, provideI18Next, withCustomErrorHandlingStrategy, withTitle };
export type { FormatPipeOptions, I18NextErrorHandlingStrategy, I18NextFeature, I18NextLoadResult, I18NextModuleParams, ITranslationEvents, ITranslationOptions, ITranslationService, MissingKeyEvent, NamespaceResolver, PipeOptions, PrependPipeOptions, ResourceEvent };

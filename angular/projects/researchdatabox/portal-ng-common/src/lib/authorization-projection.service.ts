import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { AuthorizationProjection, AuthorizationProjectionState } from './authorization-projection.models';
import { ConfigService } from './config.service';
import { HttpClientService } from './httpClient.service';
import { UtilityService } from './utility.service';

type ProjectionResponse = AuthorizationProjection | { data: AuthorizationProjection };

/**
 * Shared, fail-closed client projection of the server authorization decision.
 *
 * This service is only an affordance layer. Server routes remain authoritative.
 */
@Injectable({ providedIn: 'platform' })
export class AuthorizationProjectionService extends HttpClientService {
  private readonly stateSubject = new BehaviorSubject<AuthorizationProjectionState>({ status: 'idle' });
  private request?: Promise<AuthorizationProjection>;
  private loadedContext?: string;

  public readonly state$ = this.stateSubject.asObservable();

  constructor(
    @Inject(HttpClient) http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) utilService: UtilityService,
    @Inject(ConfigService) configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public get state(): AuthorizationProjectionState {
    return this.stateSubject.value;
  }

  public get projection(): AuthorizationProjection | undefined {
    return this.state.status === 'loaded' ? this.state.projection : undefined;
  }

  public hasScope(scopeKey: string): boolean {
    return this.projection?.scopeKeys.includes(scopeKey) ?? false;
  }

  public async load(force = false): Promise<AuthorizationProjection> {
    await this.waitForInit();
    const context = this.contextKey();

    if (!force && this.loadedContext === context && this.projection) {
      return this.projection;
    }
    if (!force && this.request && this.loadedContext === context) {
      return this.request;
    }

    this.loadedContext = context;
    this.stateSubject.next({ status: 'loading' });
    const request = this.fetchProjection();
    this.request = request;

    try {
      const projection = await request;
      if (this.request === request && this.loadedContext === context) {
        this.stateSubject.next({ status: 'loaded', projection });
      }
      return projection;
    } catch (error) {
      if (this.request === request && this.loadedContext === context) {
        // Never retain stale authority after an authentication, brand, or network failure.
        this.stateSubject.next({ status: 'error', error });
      }
      throw error;
    } finally {
      if (this.request === request) {
        this.request = undefined;
      }
    }
  }

  public refresh(): Promise<AuthorizationProjection> {
    return this.load(true);
  }

  /** Call after login, logout, account linking, or a branding/portal context change. */
  public invalidate(): void {
    this.request = undefined;
    this.loadedContext = undefined;
    this.stateSubject.next({ status: 'idle' });
  }

  private async fetchProjection(): Promise<AuthorizationProjection> {
    try {
      const response = await firstValueFrom(
        this.http.get<ProjectionResponse>(`${this.brandingAndPortalUrl}/api/authorization/me`, {
          responseType: 'json',
          observe: 'body',
          context: this.httpContext,
        })
      );
      return this.unwrapProjection(response);
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw error;
      }
      throw new Error('The authorization projection response was invalid.', { cause: error });
    }
  }

  private unwrapProjection(response: ProjectionResponse): AuthorizationProjection {
    const candidate = this.isWrapped(response) ? response.data : response;
    if (!this.isProjection(candidate)) {
      throw new Error('The authorization projection response was invalid.');
    }
    return candidate;
  }

  private isWrapped(response: ProjectionResponse): response is { data: AuthorizationProjection } {
    return typeof response === 'object' && response !== null && 'data' in response;
  }

  private isProjection(value: unknown): value is AuthorizationProjection {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const rolloutMode: unknown = Reflect.get(value, 'rolloutMode');
    const principal: unknown = Reflect.get(value, 'principal');
    const roles: unknown = Reflect.get(value, 'roles');
    const scopeKeys: unknown = Reflect.get(value, 'scopeKeys');
    return (
      (rolloutMode === 'legacy' || rolloutMode === 'shadow' || rolloutMode === 'enforce') &&
      typeof principal === 'object' &&
      principal !== null &&
      Array.isArray(roles) &&
      Array.isArray(scopeKeys) &&
      scopeKeys.every(scopeKey => typeof scopeKey === 'string')
    );
  }

  private contextKey(): string {
    return `${this.brandingAndPortalUrl}`;
  }
}

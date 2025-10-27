import {FormConstraintConfig, FormModesConfig} from "@researchdatabox/sails-ng-common";

/**
 * The client form context used to build the form config for the client.
 * The data include (all are optional)
 * - the current form mode
 * - the current user's roles
 * - the current model id
 * - the current model data
 */
export class ClientFormContext {
  current?: ClientFormCurrentContext;
  build?: ClientFormBuildContext[];

  public static createView(): ClientFormContext {
    const newInstance = new ClientFormContext();
    newInstance.current = {
      mode: 'view',
      user: {
        roles: [],
      },
      model: {
        id: undefined,
        data: null,
      }
    };
    newInstance.build = [];
    return newInstance;
  }

  public static from(other?: ClientFormContext): ClientFormContext {
    const newInstance = new ClientFormContext();
    newInstance.current = {
      mode: other?.current?.mode ?? 'view',
      user: {
        roles: other?.current?.user?.roles ?? [],
      },
      model: {
        id: other?.current?.model?.id ?? undefined,
        data: other?.current?.model?.data ?? null,
      }
    };
    newInstance.build = (other?.build ?? [])?.map(b => {
      return {
          name: b?.name,
          // constraints: FormConstraintConfig.from(b?.constraints),
      }
    });
    return newInstance;
  }

  public pathFromBuildNames() {
    return this.build?.map(i => i?.name)?.filter(i => !!i) ?? [];
  }
}

export type ClientFormCurrentContext = {
  mode: FormModesConfig;
  user?: ClientFormCurrentUserContext;
  model?: ClientFormCurrentModelContext;
};

export type ClientFormCurrentUserContext = {
  roles: string[];
};

export type ClientFormCurrentModelContext = {
  id?: string;
  data?: Record<string, unknown>;
};


export type ClientFormBuildContext = {
  name: string;
  constraints?: FormConstraintConfig;
};

export interface CustomDisplaySyncComponent {
  syncDisplayFromModel(): Promise<void> | void;
}

export interface CustomDisplaySyncComponentTree {
  formFieldBaseComponents?: Array<CustomDisplaySyncComponentLike | null | undefined>;
}

export type CustomDisplaySyncComponentLike = Partial<CustomDisplaySyncComponent> & CustomDisplaySyncComponentTree;

export function isCustomDisplaySyncComponent(
  component: CustomDisplaySyncComponentLike | null | undefined
): component is CustomDisplaySyncComponentLike & CustomDisplaySyncComponent {
  return typeof component?.syncDisplayFromModel === 'function';
}

export async function syncComponentDisplayFromModel(component: CustomDisplaySyncComponentLike | null | undefined): Promise<void> {
  if (!component) {
    return;
  }
  if (isCustomDisplaySyncComponent(component)) {
    await component.syncDisplayFromModel();
  }
  for (const childComponent of component.formFieldBaseComponents ?? []) {
    await syncComponentDisplayFromModel(childComponent ?? undefined);
  }
}

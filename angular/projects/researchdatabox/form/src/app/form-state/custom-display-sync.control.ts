export interface CustomDisplaySyncComponent {
  syncDisplayFromModel(): Promise<void> | void;
}

export interface CustomDisplaySyncComponentTree {
  formFieldBaseComponents?: Array<CustomDisplaySyncComponentLike | null | undefined>;
}

export interface CustomDisplaySyncComponentLike extends CustomDisplaySyncComponentTree {
  syncDisplayFromModel?: CustomDisplaySyncComponent['syncDisplayFromModel'];
  requestRender?: () => void;
}

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
  // Silent expression writes suppress control events, so notify the affected
  // view and layout explicitly, including descendants of groups/repeatables.
  component.requestRender?.();
  for (const childComponent of component.formFieldBaseComponents ?? []) {
    await syncComponentDisplayFromModel(childComponent ?? undefined);
  }
}

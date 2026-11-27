import type Uppy from "@uppy/core";
import type Dashboard from "@uppy/dashboard";

type UploadData = Record<string, unknown>;

export function prepareUploadForCreate(uppy?: Uppy<UploadData, UploadData>): boolean {
    if (!uppy) {
        return true;
    }
    if (Object.keys(uppy.getState().currentUploads).length || uppy.getFiles().some(file => !file.progress.uploadComplete || file.error)) {
        return false;
    }

    // Dashboard is rendered outside the form, so the form's inert state will not close it.
    const dashboard = uppy.getPlugin("Dashboard") as Dashboard<UploadData, UploadData> | undefined;
    if (dashboard?.isModalOpen()) {
        dashboard.closeModal();
    }
    return true;
}

import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import Tus from '@uppy/tus';
import type { FileUploadSourceType } from '@researchdatabox/sails-ng-common';
import type { UppyDependencies } from './file-upload.component';

export async function loadUppyDependencies(sources: FileUploadSourceType[]): Promise<UppyDependencies> {
    // Each optional source has its own boundary. Local-only uploads never fetch providers.
    const [DropboxPlugin, GoogleDrivePlugin, OneDrivePlugin] = await Promise.all([
        sources.includes('dropbox') ? import('@uppy/dropbox').then(module => module.default) : undefined,
        sources.includes('googleDrive') ? import('@uppy/google-drive').then(module => module.default) : undefined,
        sources.includes('onedrive') ? import('@uppy/onedrive').then(module => module.default) : undefined,
    ]);
    return { UppyCtor: Uppy, DashboardPlugin: Dashboard, TusPlugin: Tus, DropboxPlugin, GoogleDrivePlugin, OneDrivePlugin };
}

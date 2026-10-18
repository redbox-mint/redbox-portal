import type Dashboard from '@uppy/dashboard';

describe('Upload runtime sources', () => {
    it('loads local upload support without cloud providers', async () => {
        const { loadUppyDependencies } = await import('./file-upload.runtime');
        const deps = await loadUppyDependencies([]);
        expect(typeof deps.UppyCtor).toBe('function');
        expect(typeof deps.DashboardPlugin).toBe('function');
        expect(typeof deps.TusPlugin).toBe('function');
        expect(deps.DropboxPlugin).toBeUndefined();
        expect(deps.GoogleDrivePlugin).toBeUndefined();
        expect(deps.OneDrivePlugin).toBeUndefined();
    });

    it('loads only configured cloud sources', async () => {
        const { loadUppyDependencies } = await import('./file-upload.runtime');
        const deps = await loadUppyDependencies(['googleDrive']);
        expect(typeof deps.GoogleDrivePlugin).toBe('function');
        expect(deps.DropboxPlugin).toBeUndefined();
        expect(deps.OneDrivePlugin).toBeUndefined();
    });

    it('removes a mounted dashboard and queued files when the real uploader is destroyed', async () => {
        const { loadUppyDependencies } = await import('./file-upload.runtime');
        const { UppyCtor, DashboardPlugin } = await loadUppyDependencies([]);
        const uppy = new UppyCtor<Record<string, unknown>, Record<string, unknown>>({ autoProceed: false });
        try {
            uppy.use(DashboardPlugin, { inline: false });
            const dashboard = uppy.getPlugin<Dashboard<Record<string, unknown>, Record<string, unknown>>>('Dashboard')!;
            dashboard.openModal();
            uppy.addFile({ name: 'queued.txt', type: 'text/plain', data: new Blob(['queued']) });
            expect(document.querySelector('.uppy-Dashboard')).not.toBeNull();
            expect(uppy.getFiles().length).toBe(1);
        } finally {
            uppy.destroy();
        }
        expect(document.querySelector('.uppy-Dashboard')).toBeNull();
        expect(uppy.getFiles()).toEqual([]);
        expect(uppy.getPlugin('Dashboard')).toBeUndefined();
    });
});

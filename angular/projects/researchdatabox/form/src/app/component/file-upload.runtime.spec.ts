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
});

import { expect, test } from '../fixtures/test';

const type = 'e2e-initialisation-modes';

test('A03 filters owned dashboard records, sorts both ways, paginates and opens the selected record', async ({ adminPage, records, resources }) => {
  const prefix = resources.name('A03', 'dashboard');
  const owned = [];
  for (let index = 0; index < 12; index++) {
    owned.push(await records.create(type, { title: `${prefix} ${String(index).padStart(2, '0')}` }));
  }
  await adminPage.goto(`/default/rdmp/dashboard/${type}`);
  const app = adminPage.locator('dashboard');
  const search = app.getByRole('textbox');
  await search.fill(prefix);
  await search.press('Enter');
  const links = app.locator('tbody a').filter({ hasText: prefix });
  await expect(links).toHaveCount(10);
  const titleSort = app.locator('sort').filter({ hasText: /Title/ }).getByRole('button');
  await titleSort.click();
  const direction = await titleSort.getAttribute('aria-sort');
  const firstTitle = direction === 'ascending' ? owned[0].metadata.title : owned[11].metadata.title;
  await expect(links.first()).toHaveText(firstTitle as string);
  await titleSort.click();
  await expect(titleSort).toHaveAttribute('aria-sort', direction === 'ascending' ? 'descending' : 'ascending');
  await expect(links.first()).toHaveText((direction === 'ascending' ? owned[11] : owned[0]).metadata.title as string);
  await app.locator('pagination').getByRole('link', { name: '2', exact: true }).click();
  await expect(links).toHaveCount(2);
  await app.locator('pagination').getByRole('link', { name: '1', exact: true }).click();
  await expect(links).toHaveCount(10);
  await search.fill(`${prefix} 07`);
  await search.press('Enter');
  await expect(links).toHaveCount(1);
  await links.click();
  await expect(adminPage).toHaveURL(new RegExp(`/record/(?:edit|view)/${owned[7].oid}$`));
  await expect(adminPage.locator('redbox-form')).toContainText('Title');
  expect((await records.read(owned[7].oid)).body).toMatchObject({ title: `${prefix} 07` });
});

test('A19 searches owned indexed records, paginates, opens a result and resets to an empty search', async ({ adminPage, records, resources, adminCsrfToken }) => {
  const prefix = resources.name('A19', 'search').replace(/-/g, '');
  const owned = [];
  for (let index = 0; index < 12; index++) {
    const record = await records.create(type, { title: `${prefix} ${String(index).padStart(2, '0')}` });
    owned.push(record);
    const indexed = await adminPage.request.post('/default/rdmp/api/search/index', {
      params: { oid: record.oid }, headers: { 'X-CSRF-Token': adminCsrfToken },
    });
    expect(indexed.ok()).toBeTruthy();
  }
  // Indexing is asynchronous. Wait on the real search result count before the UI journey.
  await expect.poll(async () => {
    const response = await adminPage.request.get(`/default/rdmp/record/search/${type}/`, { params: { searchStr: prefix, rows: 10, page: 1 } });
    if (!response.ok()) throw new Error(`Search fixture readiness failed (${response.status()}).`);
    return (await response.json() as { totalItems: number }).totalItems;
  }).toBe(12);
  await adminPage.goto('/default/rdmp/record/search');
  const app = adminPage.locator('record-search');
  await app.getByRole('button', { name: 'Toggle dropdown', exact: true }).click();
  await app.locator('.dropdown-menu a').filter({ hasText: type }).click();
  await app.locator('#basic-search-input').fill(prefix);
  await app.locator('#basic-search-input').press('Enter');
  await expect(app.locator('#searchMsg')).toContainText('12');
  const links = app.locator('h3 a[target="_blank"]');
  await expect(links).toHaveCount(10);
  const firstPageTitles = await links.allTextContents();
  await app.locator('pagination').getByRole('link', { name: '2', exact: true }).click();
  await expect(links).toHaveCount(2);
  const secondPageTitles = await links.allTextContents();
  expect(new Set([...firstPageTitles, ...secondPageTitles].map(title => title.trim())).size).toBe(12);
  const href = await links.first().getAttribute('href');
  const pending = adminPage.waitForEvent('popup');
  await links.first().click();
  const opened = await pending;
  try {
    await expect(opened).toHaveURL(href!);
    await expect(opened.locator('redbox-form')).toContainText(secondPageTitles[0].trim());
  } finally { await opened.close(); }
  const refiner = app.locator('record-search-refiner').filter({ hasText: 'Title' });
  await refiner.getByRole('textbox').fill('07');
  await refiner.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(links).toHaveCount(1);
  await expect(links).toHaveText(`${prefix} 07`);
  await expect(links).toHaveAttribute('href', new RegExp(`/record/view/${owned[7].oid}$`));
  await app.getByRole('button', { name: /Reset/i }).click();
  await expect(app.locator('#basic-search-input')).toHaveValue('');
  await expect(links).toHaveCount(0);
  await app.locator('#basic-search-input').fill(`${prefix}unmatched`);
  await app.locator('#basic-search-input').press('Enter');
  await expect(app.locator('#searchMsg')).toContainText('0');
  await expect(links).toHaveCount(0);
});

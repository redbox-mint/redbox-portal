import { expect, test } from '../fixtures/test';
import { field, saveForm } from '../helpers/forms';

test('F16 structure-tabs-accordions preserve independent values across hidden panels and reload', async ({ adminPage, records }) => {
  const record = await records.create('e2e-structure-tabs-accordions', { title: 'Structure', overview: 'Overview stored', details: 'Details stored', first: 'First stored', second: 'Second stored' });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  await expect(field(adminPage, 'Overview value')).toHaveValue('Overview stored');
  await expect(field(adminPage, 'Details value')).toBeHidden();
  await field(adminPage, 'Overview value').fill('Overview edited');
  await adminPage.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(field(adminPage, 'Details value')).toHaveValue('Details stored');
  await field(adminPage, 'Details value').fill('Details edited');
  await adminPage.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(field(adminPage, 'Overview value')).toHaveValue('Overview edited');
  await field(adminPage, 'First panel value').fill('First edited');
  await adminPage.getByRole('button', { name: 'Second panel', exact: true }).click();
  await expect(field(adminPage, 'Second panel value')).toHaveValue('Second stored');
  await field(adminPage, 'Second panel value').fill('Second edited');
  await adminPage.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await expect(field(adminPage, 'First panel value')).toBeHidden();
  await expect(field(adminPage, 'Second panel value')).toBeHidden();
  await adminPage.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(field(adminPage, 'First panel value')).toHaveValue('First edited');
  await expect(field(adminPage, 'Second panel value')).toHaveValue('Second edited');
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(field(adminPage, 'Overview value')).toHaveValue('Overview edited');
  await adminPage.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(field(adminPage, 'Details value')).toHaveValue('Details edited');
  await adminPage.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(field(adminPage, 'Second panel value')).toHaveValue('Second edited');
  expect((await records.read(record.oid)).body).toMatchObject({ overview: 'Overview edited', details: 'Details edited', first: 'First edited', second: 'Second edited' });
});

test('F17 structure-nested-repeatables hydrate, add, remove and reindex at both levels', async ({ adminPage, records }) => {
  const record = await records.create('e2e-structure-nested-repeatables', { title: 'Teams', teams: [
    { name: 'Alpha', members: [{ name: 'Alice', email: 'alice@example.test' }, { name: 'Anne', email: 'anne@example.test' }] },
    { name: 'Beta', members: [{ name: 'Bob', email: 'bob@example.test' }] },
  ] });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  const outer = adminPage.locator('redbox-form-repeatable').first();
  const teams = outer.locator('.rb-form-repeatable-item').filter({ has: adminPage.getByText('Team name', { exact: true }) });
  const members = (index: number) => teams.nth(index).locator('redbox-form-repeatable .rb-form-repeatable-item');
  const remove = (row: import('@playwright/test').Locator) => row.locator(':scope > .rb-form-repeatable-item__actions .rb-form-repeatable-item__remove').click();
  await expect(teams).toHaveCount(2);
  await expect(members(0)).toHaveCount(2);
  await expect(field(members(0).nth(1), 'Member name')).toHaveValue('Anne');
  await expect(field(members(1).nth(0), 'Member name')).toHaveValue('Bob');
  await remove(members(0).nth(0));
  await expect(members(0)).toHaveCount(1);
  await field(members(0).nth(0), 'Member email').fill('anne-edited@example.test');
  await teams.nth(1).locator('redbox-form-repeatable .rb-form-repeatable__add').click();
  await expect(members(1)).toHaveCount(2);
  await field(members(1).nth(1), 'Member name').fill('Bea');
  await field(members(1).nth(1), 'Member email').fill('bea@example.test');
  await outer.locator(':scope > .rb-form-repeatable > .rb-form-repeatable__add').click();
  await expect(teams).toHaveCount(3);
  await field(teams.nth(2), 'Team name').fill('Gamma');
  await teams.nth(2).locator('redbox-form-repeatable .rb-form-repeatable__add').click();
  await field(members(2).nth(0), 'Member name').fill('Grace');
  await field(members(2).nth(0), 'Member email').fill('grace@example.test');
  await remove(teams.nth(0));
  await expect(teams).toHaveCount(2);
  await expect(field(teams.nth(0), 'Team name')).toHaveValue('Beta');
  await remove(members(0).nth(0));
  await field(members(0).nth(0), 'Member email').fill('bea-reindexed@example.test');
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(teams).toHaveCount(2);
  await expect(members(0)).toHaveCount(1);
  await expect(field(members(0).nth(0), 'Member email')).toHaveValue('bea-reindexed@example.test');
  await expect(field(members(1).nth(0), 'Member email')).toHaveValue('grace@example.test');
  expect((await records.read(record.oid)).body).toMatchObject({ teams: [
    { name: 'Beta', members: [{ name: 'Bea', email: 'bea-reindexed@example.test' }] },
    { name: 'Gamma', members: [{ name: 'Grace', email: 'grace@example.test' }] },
  ] });
});

test('F18 structure-question-tree clears hidden branches and restores the saved deeper selection', async ({ adminPage, records }) => {
  const record = await records.create('e2e-structure-question-tree', { title: 'Decision', decision: { branch: 'alpha', alpha: 'open' } });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  await expect(adminPage.getByRole('radio', { name: 'Alpha branch', exact: true })).toBeChecked();
  await expect(adminPage.getByRole('radio', { name: 'Alpha open', exact: true })).toBeChecked();
  await expect(adminPage.getByRole('radio', { name: 'Beta restricted', exact: true })).toBeHidden();
  await adminPage.getByRole('radio', { name: 'Beta branch', exact: true }).check();
  await expect(adminPage.getByRole('radio', { name: 'Alpha open', exact: true })).toBeHidden();
  await adminPage.getByRole('radio', { name: 'Beta restricted', exact: true }).check();
  await adminPage.getByRole('radio', { name: 'Participant consent', exact: true }).check();
  await saveForm(adminPage);
  expect((await records.read(record.oid)).body).toMatchObject({ decision: { branch: 'beta', alpha: null, beta: 'restricted', reason: 'consent' } });
  await adminPage.reload();
  await expect(adminPage.getByRole('radio', { name: 'Beta branch', exact: true })).toBeChecked();
  await expect(adminPage.getByRole('radio', { name: 'Participant consent', exact: true })).toBeChecked();
  await adminPage.getByRole('radio', { name: 'Beta open', exact: true }).check();
  await expect(adminPage.getByRole('radio', { name: 'Participant consent', exact: true })).toBeHidden();
  await saveForm(adminPage);
  expect((await records.read(record.oid)).body).toMatchObject({ decision: { branch: 'beta', alpha: null, beta: 'open', reason: null } });
});

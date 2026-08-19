const input = document.querySelector('#search');
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const rows = [...document.querySelectorAll('[data-search]')];

function update() {
  const query = (input?.value ?? '').toLowerCase().trim();
  let visible = 0;
  for (const row of rows) {
    row.hidden = Boolean(query) && !row.dataset.search.includes(query);
    if (!row.hidden) visible += 1;
  }
  if (status) status.textContent = query ? visible + ' of ' + rows.length + ' contracts' : rows.length + ' contracts';
  if (empty) empty.hidden = visible > 0;
}

input?.addEventListener('input', update);
update();

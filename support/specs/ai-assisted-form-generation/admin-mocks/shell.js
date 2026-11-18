/* Mock-only shell: renders the shared admin header, sidebar and the AI drafting tab strip so each
   mock page stays focused on its own content. Mirrors admin-ui-redesign/mocks/Header + Sidebar. */
(function () {
  const LOGO = '../../admin-ui-redesign/mocks/redbox-logo.png';

  const header = `
  <header>
    <div class="util"><span>Welcome Local Admin</span><a href="#">Logout</a></div>
    <div class="band" style="padding:10px 32px"><img src="${LOGO}" alt="ReDBox — Research Data Box" style="height:52px"></div>
    <nav class="mainnav" aria-label="Main">
      <a href="#">Home</a><a href="#">Plan ▾</a><a href="#">Workspaces ▾</a><a href="#">Manage ▾</a>
      <a href="#">Publish and share ▾</a><a href="index.html" class="on">Admin</a>
      <form class="search" role="search"><input aria-label="Search keywords" placeholder="keywords"><button type="button">Search</button></form>
    </nav>
  </header>`;

  const sections = [
    ['Records & reporting', ['Reports', 'Named queries', 'Harvest runs', 'Export', 'Deleted records']],
    ['People & access', ['Users', 'Roles', 'Authorized domains']],
    ['Site & content', ['System messages', 'Menu', 'Home panels', 'Admin sidebar', 'Dashboards', 'Branding', 'Translations', 'Web analytics']],
    ['Lookups & vocabularies', ['Parties', 'Vocabularies', 'Figshare vocabularies']],
    ['Integrations', ['Figshare publishing', 'Oni publishing', 'DOI publishing', 'RAiD publishing', 'Notifications', ['AI-assisted drafting', 'index.html', 'Setup', 'sb-tag new', true]]],
    ['Developer', ['API docs']],
  ];

  const sidebar = `
  <aside class="sb" aria-label="Admin navigation" style="max-width:248px">
    <div class="sb-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
      <input aria-label="Find an admin page" placeholder="Find a setting…">
    </div>
    <a class="sb-item" href="#"><span>Overview</span></a>
    ${sections.map(([title, items]) => `
      <div class="sb-sec"><div class="sb-h"><span>${title.replaceAll('&', '&amp;')}</span></div>
      ${items.map((it) => {
        if (typeof it === 'string') return `<a class="sb-item" href="#"><span>${it}</span></a>`;
        const [label, href, tag, tagCls, active] = it;
        return `<a class="sb-item${active ? ' active' : ''}" href="${href}" ${active ? 'aria-current="page"' : ''}><span>${label}</span><span class="${tagCls}">${tag}</span></a>`;
      }).join('')}
      </div>`).join('')}
  </aside>`;

  const tabs = [
    ['overview', 'Overview', 'index.html'],
    ['profiles', 'Profiles', 'profiles.html', '1'],
    ['actions', 'Form actions', 'actions.html'],
    ['models', 'Models', 'ai-sdk.html', '3'],
    ['knowledge', 'Guidance', 'knowledge.html', '1'],
    ['activity', 'Activity', 'activity.html'],
  ];

  function render() {
    const h = document.getElementById('rb-header');
    if (h) h.outerHTML = header;
    const s = document.getElementById('rb-sidebar');
    if (s) s.outerHTML = sidebar;
    const t = document.getElementById('gen-tabs');
    if (t) {
      const active = t.dataset.active;
      t.outerHTML = `<nav class="tabs" aria-label="AI-assisted drafting sections">${tabs.map(([id, label, href, count]) =>
        `<a href="${href}" class="${id === active ? 'on' : ''}" ${id === active ? 'aria-current="page"' : ''}>${label}${count ? ` <span class="badge">${count}</span>` : ''}</a>`).join('')}</nav>`;
    }

    // Mock interactivity: segmented buttons, show/hide panels, range outputs.
    document.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    }));
    document.querySelectorAll('[data-show]').forEach((input) => input.addEventListener('change', () => {
      const group = input.name;
      document.querySelectorAll(`[data-panel-group="${group}"]`).forEach((p) => { p.hidden = p.dataset.panel !== input.dataset.show; });
    }));
    document.querySelectorAll('input[type=range][data-out]').forEach((r) => {
      const o = document.getElementById(r.dataset.out);
      const upd = () => { o.textContent = r.value; };
      r.addEventListener('input', upd); upd();
    });
    document.querySelectorAll('[data-dirty]').forEach((el) => el.addEventListener('input', () => {
      const st = document.querySelector('.savebar .state');
      if (st) st.innerHTML = '<span class="dot" style="color:#ffc107"></span>Unsaved changes';
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();

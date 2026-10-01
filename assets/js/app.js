const PAGE = {
  registry: {},
  register(route, fn) { this.registry[route] = fn; },
  get(route) { return this.registry[route]; },
};

function buildShell() {
  const currentRoute = document.body.dataset.page || 'index';
  const navHTML = CONFIG.nav.map(item => {
    if (item.section) return `<div class="nav-section">${item.section}</div>`;
    const isActive = item.route === currentRoute;
    return `<a href="${item.route}.html" class="nav-link${isActive ? ' active' : ''}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span>
    </a>`;
  }).join('');

  document.getElementById('app-shell').innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-logo">◈</div>
        <div>
          <div class="brand-name">${CONFIG.brand.short}</div>
          <div class="brand-sub">${CONFIG.brand.sub}</div>
        </div>
      </div>
      <nav class="sidebar-nav">${navHTML}</nav>
      <div class="sidebar-footer">
        <div><span>Currency</span><b id="sideCurrency">—</b></div>
        <div><span>Status</span><b id="sideStatus">Loading…</b></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div>
          <div class="breadcrumb" id="breadcrumb">Home</div>
          <div class="page-title" id="pageTitle">${document.body.dataset.title || 'Dashboard'}</div>
        </div>
      </header>
    </div>`;
}

async function boot() {
  buildShell();
  document.getElementById('view').innerHTML =
    '<div class="loading"><div class="spinner"></div><div>Connecting to Supabase…</div></div>';

  try {
    await DB.loadAll();
  } catch (e) {
    console.error(e);
    document.getElementById('view').innerHTML = `
      <div class="error-box">
        <strong>Failed to load data:</strong> ${e.message}<br><br>
        <small>Check that your config.js has the correct Supabase URL and anon key.</small><br><br>
        <button onclick="location.reload()" style="padding:.55rem 1rem;background:#0f5248;color:#fff;border:none;border-radius:.55rem;font-weight:600;cursor:pointer;">Retry</button>
      </div>`;
    return;
  }

  document.getElementById('sideCurrency').textContent = DB.state.org.currency;
  const status = document.getElementById('sideStatus');
  status.textContent = '✓ Connected';
  status.style.color = '#059669';

  const route = document.body.dataset.page;
  const fn = PAGE.get(route);
  if (fn) {
    try {
      const html = await fn();
      document.getElementById('view').innerHTML = html;
    } catch (e) {
      console.error(e);
      document.getElementById('view').innerHTML =
        `<div class="error-box">Render error: ${e.message}</div>`;
    }
  } else {
    document.getElementById('view').innerHTML =
      `<div class="error-box">No render function for page "${route}"</div>`;
  }
}

window.PAGE = PAGE;
window.addEventListener('DOMContentLoaded', boot);
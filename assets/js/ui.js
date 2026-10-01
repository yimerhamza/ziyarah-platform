const UI = {
  toast(msg, type = 'ok') {
    const wrap = document.getElementById('toast-root');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  },
  modal(html) {
    document.getElementById('modal-root').innerHTML =
      `<div class="modal-bg show" onclick="if(event.target===this)UI.closeModal()">
         <div class="modal">${html}</div>
       </div>`;
  },
  closeModal() { document.getElementById('modal-root').innerHTML = ''; },
  guard(fn) {
    return async function (...args) {
      try { await fn.apply(this, args); }
      catch (e) { console.error(e); UI.toast(e.message, 'err'); }
    };
  },
  money(n) {
    const s = (window.DB && DB.state && DB.state.org && DB.state.org.symbol) || 'Br';
    return s + ' ' + Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  },
  kpi(label, value, sub, color) {
    return `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${color || ''}">${value}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>`;
  },
  pill(status) {
    return `<span class="pill pill-${String(status).toLowerCase()}">${status}</span>`;
  },
  avatar(name, size = 36) {
    const initials = String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const palette = ['#0f5248', '#146b5d', '#1a8874', '#c9a227', '#b08e1e', '#0b3d36'];
    const color = palette[String(name).charCodeAt(0) % palette.length];
    return `<div style="width:${size}px;height:${size}px;background:${color};display:grid;place-items:center;border-radius:50%;color:#fff;font-weight:700;font-size:12px;flex-shrink:0;">${initials}</div>`;
  },
  header(title, subtitle, actions) {
    return `<div class="page-header">
      <div><h1>${title}</h1><p>${subtitle}</p></div>
      <div class="page-actions">${actions || ''}</div>
    </div>`;
  },
  emptyState(icon, title, msg, actionLabel, actionFn) {
    return `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      <div class="empty-msg">${msg}</div>
      ${actionLabel ? `<button onclick="${actionFn}" style="padding:.55rem 1rem;background:#0f5248;color:#fff;border:none;border-radius:.55rem;font-weight:600;cursor:pointer;">${actionLabel}</button>` : ''}
    </div>`;
  },
};

window.UI = UI;
window.toast = UI.toast;
window.guard = UI.guard;
window.money = UI.money;
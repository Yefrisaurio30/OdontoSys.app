/* ================================================
   SISTEMA DE ODONTOLOGÍA - Utilidades y Estado Global
   ================================================ */


// ─── Sesión activa ──────────────────────────────────────────────────────────
const Session = {
  usuario: null,

  set(usuario) {
    this.usuario = usuario;
    localStorage.setItem('odonto_session', JSON.stringify(usuario));
    if (usuario && usuario.token) {
      localStorage.setItem('token', usuario.token);
    }
  },

  get() {
    if (this.usuario) return this.usuario;
    const stored = localStorage.getItem('odonto_session');
    const token = localStorage.getItem('token');
    if (stored && token) { 
      try {
        this.usuario = JSON.parse(stored);
        return this.usuario;
      } catch (e) {
        this.clear();
        return null;
      }
    }
    return null;
  },

  clear() {
    this.usuario = null;
    localStorage.removeItem('odonto_session');
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  },

  isAdmin() {
    const u = this.get();
    return u && (u.rol || '').toUpperCase() === 'ADMIN';
  },

  requireLogin() {
    const u = this.get();
    if (!u) { window.location.href = 'index.html'; return false; }
    return true;
  },

  requireAdmin() {
    if (!this.requireLogin()) return false;
    if (!this.isAdmin()) { window.location.href = 'menu.html'; return false; }
    return true;
  },
};

// ─── Helpers de BD ──────────────────────────────────────────────────────────
// Este archivo **no debe** definir su propio DAO ni hacer referencia a `DB`.
// El objeto `DAO` se exporta/define en **Supabase.js**, que se carga después de
// `app.js` en cada HTML. Si el archivo Supabase no se carga correctamente el
// login fallará con "DB is not defined", pero la conexión real se maneja allí.
//
// Nota: puedes dejar el DAO vacío aquí como marcador, o eliminarlo por completo. // será reemplazado por Supabase.js

// ─── Utilidades UI ──────────────────────────────────────────────────────────
function hoy() {
  return new Date().toISOString().split('T')[0];
}

function showToast(msg, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function confirmDialog(title, message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.remove('hidden');

    const yes = document.getElementById('confirm-yes');
    const no  = document.getElementById('confirm-no');

    const cleanup = (result) => {
      overlay.classList.add('hidden');
      yes.replaceWith(yes.cloneNode(true));
      no.replaceWith(no.cloneNode(true));
      resolve(result);
    };

    document.getElementById('confirm-yes').addEventListener('click', () => cleanup(true));
    document.getElementById('confirm-no').addEventListener('click',  () => cleanup(false));
  });
}

// ─── Snippet del modal de confirmación (insertar en cada página que lo use) ─
const confirmModalHTML = `
<div id="confirm-modal" class="modal-overlay hidden">
  <div class="modal-box">
    <h3 id="confirm-title">¿Confirmar acción?</h3>
    <p id="confirm-message">Esta acción no se puede deshacer.</p>
    <div class="modal-actions">
      <button id="confirm-no"  class="btn btn-ghost">Cancelar</button>
      <button id="confirm-yes" class="btn btn-danger">Confirmar</button>
    </div>
  </div>
</div>`;

// ─── Barra superior reutilizable ─────────────────────────────────────────────
function renderTopBar(title) {
  const u = Session.get() || {};
  const uname = u.nombre || u.username || u.email || 'Usuario';
  const initials = uname.substring(0, 2).toUpperCase();
  const rol = u.rol || 'USUARIO';
  
  return `
  <div class="top-bar">
    <div class="logo">
      <div class="logo-icon">🦷</div>
      <div class="logo-text">
        OdontoSys
        <span>${title}</span>
      </div>
    </div>
    <div class="user-info">
      <div class="user-avatar">${initials}</div>
      <div>
        <div style="font-weight:600; font-size:0.875rem;">${uname}</div>
        <div style="font-size:0.75rem; color:var(--gris-texto);">${rol}</div>
      </div>
      <a href="menu.html" class="btn btn-ghost btn-sm">← Menú</a>
      <button onclick="cerrarSesion()" class="btn btn-ghost btn-sm">Cerrar sesión</button>
    </div>
  </div>`;
}

function cerrarSesion() {
  Session.clear();
  window.location.href = 'index.html';
}

function drawSmallLandmarks(ctx, det, radius = 0.5) {
  const pts = det.landmarks.positions;
  if (!pts) return;
  ctx.fillStyle = '#17f54ec0';
  for (const pt of pts) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// ─── Validaciones Globales ──────────────────────────────────────────────────
const Validator = {
  // Solo letras (con tildes y espacios)
  soloLetras: (e) => {
    e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
  },
  // Solo números
  soloNumeros: (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  },
  // Limitar longitud a máximo 10 caracteres
  limitarLongitud10: (e) => {
    if (e.target.value.length > 10) {
      e.target.value = e.target.value.slice(0, 10);
    }
  },
  // Validar email básico (debe tener @)
  esEmailValido: (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  // Obtener fecha/hora actual en Colombia
  getColombiaNow: () => {
    const now = new Date();
    // Offset de Colombia es UTC-5
    // Una forma simple de obtener la fecha local de Colombia:
    const bogota = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
    return bogota;
  },
  // Formatear para input datetime-local
  formatForInput: (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
};

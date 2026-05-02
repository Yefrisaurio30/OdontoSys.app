const API_BASE = window.location.origin;

const DAO = {
  _pacientesCache: [],
  _odontologosCache: [],

  async request(endpoint, method = 'GET', body = null, isFormData = false) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    };

    if (body) {
      if (isFormData) {
        options.body = body;
      } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
    }

    const res = await fetch(`${API_BASE}/api/${endpoint}`, options);
    if (res.status === 401) {
      console.warn('⚠️ Token inválido o expirado. Redirigiendo al login...');
      if (typeof Session !== 'undefined') Session.clear();
      else {
        localStorage.removeItem('token');
        localStorage.removeItem('odonto_session');
      }
      window.location.href = 'index.html';
      throw new Error('Sesión expirada');
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Error en ${endpoint}`);
    }
    return res.json();
  },

  // ===== AUTH =====
  async login(username, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error en login');
    }
    return res.json();
  },

  async registrar(username, password, nombre, apellido, dni, telefono, email) {
    return this.request('auth/registrar', 'POST', {
      username,
      email,
      password,
      nombre,
      apellido,
      cedula: dni,
      telefono
    });
  },

  async recuperar(email) {
    return this.request('auth/recuperar', 'POST', { email });
  },

  async resetPassword(token, nueva_password) {
    return this.request('auth/reset', 'POST', { token, nueva_password });
  },

  // ===== PACIENTES / CLIENTES =====
  async getPacientes() {
    const data = await this.request('clientes');
    return data.map(p => ({ id: p._id || p.id, dni: p.cedula, ...p }));
  },
  async getPaciente(id) {
    const p = await this.request(`clientes/${id}`);
    return { id: p._id || p.id, dni: p.cedula, ...p };
  },
  async addPaciente(data) {
    const fd = new FormData();
    Object.keys(data).forEach(k => fd.append(k, data[k]));
    // Map DNI to cedula for backend
    if (data.dni && !data.cedula) fd.append('cedula', data.dni);
    return this.request('clientes', 'POST', fd, true);
  },
  async updatePaciente(data) {
    const id = data.id || data._id;
    const fd = new FormData();
    Object.keys(data).forEach(k => fd.append(k, data[k]));
    if (data.dni && !data.cedula) fd.append('cedula', data.dni);
    return this.request(`clientes/${id}`, 'PUT', fd, true);
  },
  async deletePaciente(id) {
    return this.request(`clientes/${id}`, 'DELETE');
  },

  // Alias para clientes.html
  async getClientes() { return this.getPacientes(); },
  async getCliente(id) { return this.getPaciente(id); },
  async addCliente(formData) { return this.request('clientes', 'POST', formData, true); },
  async updateCliente(id, formData) { return this.request(`clientes/${id}`, 'PUT', formData, true); },
  async deleteCliente(id) { return this.request(`clientes/${id}`, 'DELETE'); },

  // ===== ODONTÓLOGOS =====
  async getOdontologos() {
    const data = await this.request('odontologos');
    return data.map(o => ({ id: o._id || o.id, ...o }));
  },
  async addOdontologo(data) {
    return this.request('odontologos', 'POST', data);
  },
  async updateOdontologo(data) {
    const id = data.id || data._id;
    return this.request(`odontologos/${id}`, 'PUT', data);
  },
  async deleteOdontologo(id) {
    return this.request(`odontologos/${id}`, 'DELETE');
  },

  // ===== CITAS =====
  async getCitas() {
    const data = await this.request('citas');
    return data.map(c => ({ id: c._id || c.id, ...c }));
  },
  async addCita(data) {
    return this.request('citas', 'POST', data);
  },
  async updateCita(data) {
    const id = data.id || data._id;
    return this.request(`citas/${id}`, 'PUT', data);
  },
  async deleteCita(id) {
    return this.request(`citas/${id}`, 'DELETE');
  },

  // ===== PRODUCTOS =====
  async getProductos() {
    const data = await this.request('productos');
    return data.map(p => ({ id: p._id || p.id, ...p }));
  },
  async getProducto(id) {
    const p = await this.request(`productos/${id}`);
    return { id: p._id || p.id, ...p };
  },
  async addProducto(data) {
    return this.request('productos', 'POST', data);
  },
  async updateProducto(data) {
    const id = data.id || data._id;
    return this.request(`productos/${id}`, 'PUT', data);
  },
  async deleteProducto(id) {
    return this.request(`productos/${id}`, 'DELETE');
  },

  // ===== VENTAS / CAJA =====
  async getVentas() { return this.request('ventas'); },
  async addVenta(data) { return this.request('ventas', 'POST', data); },
  async getCaja() { return this.request('caja'); },

  // ===== USUARIOS =====
  async getUsuarios() {
    const data = await this.request('usuarios');
    return data.map(u => ({ id: u._id || u.id, username: u.email, password_hash: u.password, ...u }));
  },
  async addUsuario(data) {
    return this.request('usuarios', 'POST', { email: data.username, password: data.password, rol: data.rol, nombre: data.username });
  },
  async updateUsuario(data) {
    const id = data.id || data._id;
    return this.request(`usuarios/${id}`, 'PUT', { email: data.username, password: data.password, rol: data.rol });
  },
  async deleteUsuario(id) {
    return this.request(`usuarios/${id}`, 'DELETE');
  },

  // ===== CACHE Y HELPERS =====
  _usuariosCache: [],
  async loadNombreCache() {
    const [pacs, odos, usus] = await Promise.all([
      this.getPacientes(), 
      this.getOdontologos(),
      this.getUsuarios()
    ]);
    this._pacientesCache = pacs;
    this._odontologosCache = odos;
    this._usuariosCache = usus;
  },
  nombrePaciente(id) {
    // Buscar en clientes
    const p = this._pacientesCache.find(x => String(x.id || x._id) === String(id));
    if (p) return `${p.nombre} ${p.apellido}`;
    
    // Buscar en usuarios del sistema (por si es un usuario recién registrado)
    const u = this._usuariosCache.find(x => String(x.id || x._id) === String(id) || String(x.email) === String(id));
    if (u) return u.nombre || u.username || 'Usuario';
    
    return 'Desconocido';
  },
  nombreOdontologo(id) {
    const o = this._odontologosCache.find(x => String(x.id || x._id) === String(id));
    return o ? `Dr. ${o.nombre} ${o.apellido}` : 'Desconocido';
  }
};

window.DAO = DAO;

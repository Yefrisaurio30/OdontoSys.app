/* ================================================
    MONGODB DAO - Cliente para todas las operaciones CRUD
    Conectado al backend Node.js -> MongoDB Atlas
    ================================================ */



let API_URL = window.location.origin + '/api';
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  if (!window.location.port || window.location.port !== '3001') {
    API_URL = 'http://localhost:3001/api';
  }
}


console.log('MongoDB.js cargado');

const MongoDAO = {
  async request(endpoint, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(`${API_URL}/${endpoint}`, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Error parseando JSON:', text);
      throw new Error('Respuesta del servidor no es JSON válido');
    }
    if (!res.ok) throw new Error(data.error || 'Error en petición');
    return data;
  },


  // ===== PACIENTES =====
  getPacientes() { return this.request('pacientes'); },
  getPaciente(id) { return this.request(`pacientes/${id}`); },
  addPaciente(p) { return this.request('pacientes', 'POST', p); },
  updatePaciente(id, p) { return this.request(`pacientes/${id}`, 'PUT', p); },
  deletePaciente(id) { return this.request(`pacientes/${id}`, 'DELETE'); },

  // ===== ODONTÓLOGOS =====
  getOdontologos() { return this.request('odontologos'); },
  addOdontologo(o) { return this.request('odontologos', 'POST', o); },
  updateOdontologo(id, o) { return this.request(`odontologos/${id}`, 'PUT', o); },
  deleteOdontologo(id) { return this.request(`odontologos/${id}`, 'DELETE'); },

  // ===== CITAS =====
  getCitas() { return this.request('citas'); },
  getCitasPorPaciente(idPaciente) { return this.request(`citas/paciente/${idPaciente}`); },
  addCita(c) { return this.request('citas', 'POST', c); },
  updateCita(id, c) { return this.request(`citas/${id}`, 'PUT', c); },
  deleteCita(id) { return this.request(`citas/${id}`, 'DELETE'); },

  // ===== INVENTARIO =====
  getInventario() { return this.request('inventario'); },
  getInventarioById(id) { return this.request(`inventario/${id}`); },
  addInventario(i) { return this.request('inventario', 'POST', i); },
  updateInventario(id, i) { return this.request(`inventario/${id}`, 'PUT', i); },
  deleteInventario(id) { return this.request(`inventario/${id}`, 'DELETE'); },

  // ===== USUARIOS =====
  addUsuario(u) { return this.request('usuarios', 'POST', u); }
};

const mongoExport = {
  toXLSX(data, filename = 'inventario') {
    if (!data || data.length === 0) return;
    
    const keys = Object.keys(data[0]).filter(k => !k.includes('_id') && !k.includes('At'));
    const headers = keys.map(k => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '));
    
    const rows = data.map(item => keys.map(k => String(item[k] || '')));
    
    const csvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  toPDF(data, titulo = 'Reporte') {
    if (!data || data.length === 0) return;
    
    const keys = Object.keys(data[0]).filter(k => !k.includes('_id') && !k.includes('At'));
    const headers = keys.map(k => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '));
    
    const printContent = `
      <html><head><title>${titulo}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #2563A8; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background: #3B82C4; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
        .info { text-align: center; color: #666; margin-top: 10px; font-size: 12px; }
      </style></head><body>
        <h1>${titulo}</h1>
        <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
          ${data.map(item => `<tr>${keys.map(k => `<td>${item[k] || ''}</td>`).join('')}</tr>`).join('')}
        </tbody></table>
        <p class="info">Generado el ${new Date().toLocaleString()}</p>
        <script>window.onload = function() { window.print(); }</script>
      </body></html>`;

    const blob = new Blob([printContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titulo.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

window.mongoExport = mongoExport;
window.MongoDAO = MongoDAO;
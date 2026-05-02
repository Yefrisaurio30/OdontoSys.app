require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { Pool } = require('pg');
const path = require('path');
// Configuración de DNS solo para Windows local si hay problemas con MongoDB Atlas
if (process.platform === 'win32') {
  const dns = require('dns');
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    console.warn('⚠️ No se pudo configurar servidores DNS alternativos:', e.message);
  }
}

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.set('trust proxy', true); // Necesario para detectar HTTPS correctamente en Render/Vercel
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3001;

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, `rut_${Date.now()}_${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo se permiten archivos PDF'));
  }
});

const fs = require('fs');
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

const transporter = nodemailer.createTransport({
  host: 'smtp.googlemail.com',
  port: 465,
  secure: true,
  auth: { 
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS 
  },
  debug: true,
  logger: true,
  tls: {
    rejectUnauthorized: false
  }
});

console.log('📧 Configuración de correo:');
console.log('   - Usuario:', process.env.EMAIL_USER ? 'CONFIGURADO ✅' : 'FALTA ❌');
console.log('   - Password:', process.env.EMAIL_PASS ? 'CONFIGURADO ✅' : 'FALTA ❌');
console.log('   - From:', process.env.EMAIL_FROM ? process.env.EMAIL_FROM : 'Usando usuario predeterminado');

// MongoDB
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || 'DATAACCESS';

let mongoClient = null;
let mongoDb = null;

async function connectMongo() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI no definida en .env');
    return;
  }

  console.log('📡 Intentando conectar a MongoDB Atlas...');

  try {
    mongoClient = new MongoClient(MONGO_URI, {
      serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 20000
    });

    await mongoClient.connect();
    await mongoClient.db('admin').command({ ping: 1 });
    mongoDb = mongoClient.db(MONGO_DB);
    console.log('✅ CONECTADO A MONGODB ATLAS — DB:', MONGO_DB);
    return;
  } catch (e1) {
    console.warn('⚠️ Error de conexión MongoDB:', e1.message);
    if (e1.message.includes('ECONNREFUSED') || e1.message.includes('querySrv')) {
      console.log('💡 Tip: Este error suele ser por DNS en Windows. He intentado forzar DNS de Google, pero verifica tu conexión.');
    }
    try { if (mongoClient) await mongoClient.close(); } catch { }
  }

  console.error('❌ No se pudo establecer conexión. Reintentando en 20s...');
  setTimeout(connectMongo, 20000);
}

// PostgreSQL
const pgPool = new Pool({
  host: process.env.PG_HOST || 'localhost', port: process.env.PG_PORT || 5432,
  user: process.env.PG_USER || 'postgres', password: process.env.PG_PASSWORD || '1234',
  database: process.env.PG_DB || 'odontosys'
});

async function connectPG() {
  try {
    await pgPool.query('SELECT 1');
    console.log('✅ CONECTADO A POSTGRESQL');
  } catch (e) { console.error('⚠️ ERROR PG:', e.message); }
}

// Helpers
function isValidId(id) { return ObjectId.isValid(id) && id.length === 24; }

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) return res.status(401).json({ error: 'Sin autorización' });

  if (!process.env.JWT_SECRET) {
    console.error('❌ ERROR: JWT_SECRET no está definido en .env');
    return res.status(500).json({ error: 'Error interno del servidor (secreto no configurado)' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.error('❌ JWT Verification Error:', err.message);
    res.status(401).json({ error: 'Token inválido' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true, mongo: !!mongoDb }));

// ═══════════════ MÓDULO 1: LOGIN ═══════════════
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body; // 'email' aquí representa el input del usuario (puede ser username)
    if (!email || !password) return res.status(400).json({ error: 'Usuario/Email y contraseña son requeridos' });

    // Buscar por email O por username
    const user = await mongoDb.collection('usuarios_sistema').findOne({
      $or: [{ email: email }, { username: email }]
    });
    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = jwt.sign({ id: user._id.toString(), email: user.email, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, id: user._id.toString(), username: user.username, nombre: user.nombre, rol: user.rol });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/registrar', async (req, res) => {
  try {
    const { username, email, password, nombre, apellido, cedula, telefono } = req.body;
    if (!username || !email || !password || !nombre || !apellido || !cedula) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    // Validación de Gmail en el servidor
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos @gmail.com para recuperación de contraseña' });
    }

    // Validaciones de formato
    const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    const soloNumeros = /^[0-9]+$/;

    if (!soloLetras.test(nombre) || !soloLetras.test(apellido))
      return res.status(400).json({ error: 'Nombre/Apellido no pueden contener números' });
    if (!soloNumeros.test(cedula))
      return res.status(400).json({ error: 'La cédula debe ser solo números' });
    if (telefono && (!soloNumeros.test(telefono) || telefono.length < 10))
      return res.status(400).json({ error: 'Teléfono inválido (mínimo 10 dígitos numéricos)' });

    // Verificación de duplicados
    const col = mongoDb.collection('usuarios_sistema');
    const duplicado = await col.findOne({
      $or: [
        { username },
        { email },
        { cedula },
        { telefono },
        { nombre, apellido }
      ]
    });

    if (duplicado) {
      if (duplicado.username === username) return res.status(409).json({ error: 'El nombre de usuario ya existe' });
      if (duplicado.email === email) return res.status(409).json({ error: 'El correo electrónico ya está registrado' });
      if (duplicado.cedula === cedula) return res.status(409).json({ error: 'La cédula ya está registrada' });
      if (duplicado.telefono === telefono) return res.status(409).json({ error: 'El teléfono ya está registrado' });
      if (duplicado.nombre === nombre && duplicado.apellido === apellido)
        return res.status(409).json({ error: 'Ya existe un usuario con ese nombre y apellido' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = { username, email, password: hash, plain_password: password, nombre, apellido, cedula, telefono, rol: 'USUARIO', fecha_registro: new Date() };
    const result = await col.insertOne(user);

    // También creamos el registro en la colección de clientes (pacientes) para que aparezca en el sistema de citas
    await mongoDb.collection('clientes').insertOne({
      nombre,
      apellido,
      cedula,
      telefono,
      email,
      usuario_sistema_id: result.insertedId,
      fecha_registro: new Date()
    });

    res.status(201).json({ mensaje: 'Usuario creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/recuperar', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await mongoDb.collection('usuarios_sistema').findOne({ email });
    if (!user) return res.status(404).json({ error: 'Correo no registrado' });
    const token = require('crypto').randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 3600000);
    await mongoDb.collection('usuarios_sistema').updateOne({ email }, { $set: { token_recuperacion: token, token_expiracion: expira } });
    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    
    // Si el protocolo viene como 'http,https', tomamos solo https
    const cleanProtocol = protocol.includes(',') ? protocol.split(',')[1] : protocol;
    
    await transporter.sendMail({
      from: `OdontoSys <${process.env.EMAIL_USER}>`, 
      to: email,
      subject: 'Recuperación de contraseña — OdontoSys',
      html: `<p>Haz clic en el enlace para restablecer tu contraseña:</p><a href="${cleanProtocol}://${host}/reset.html?token=${token}">Restablecer contraseña</a><p>El enlace expira en 1 hora.</p>`
    });

    res.json({ mensaje: 'Correo enviado' });
  } catch (e) { 
    console.error('❌ Error en recuperación:', e.message);
    res.status(500).json({ error: 'No se pudo enviar el correo: ' + e.message }); 
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const { token, nueva_password } = req.body;
    const user = await mongoDb.collection('usuarios_sistema').findOne({ token_recuperacion: token, token_expiracion: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Token inválido o expirado' });
    const hash = await bcrypt.hash(nueva_password, 10);
    await mongoDb.collection('usuarios_sistema').updateOne(
      { _id: user._id },
      {
        $set: {
          password: hash,
          plain_password: nueva_password,
          token_recuperacion: null,
          token_expiracion: null
        }
      }
    );
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════ MÓDULO 2: CLIENTES ═══════════════
app.get('/api/clientes', authMiddleware, async (req, res) => {
  try { res.json(await mongoDb.collection('clientes').find().sort({ fecha_registro: -1 }).toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clientes/buscar', authMiddleware, async (req, res) => {
  try {
    const cliente = await mongoDb.collection('clientes').findOne({ cedula: req.query.cedula });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clientes/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const cliente = await mongoDb.collection('clientes').findOne({ _id: new ObjectId(req.params.id) });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clientes', authMiddleware, upload.single('rut_pdf'), async (req, res) => {
  try {
    const { nombre, apellido, cedula, telefono, email } = req.body;
    if (!nombre || !apellido || !cedula) return res.status(400).json({ error: 'Nombre, apellido y cédula son obligatorios' });

    // Validaciones de formato
    const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    const soloNumeros = /^[0-9]+$/;
    if (!soloLetras.test(nombre) || !soloLetras.test(apellido))
      return res.status(400).json({ error: 'Nombre/Apellido no pueden contener números' });
    if (!soloNumeros.test(cedula))
      return res.status(400).json({ error: 'La cédula debe ser solo números' });
    if (telefono && (!soloNumeros.test(telefono) || telefono.length < 10))
      return res.status(400).json({ error: 'Teléfono inválido (mínimo 10 dígitos numéricos)' });

    const col = mongoDb.collection('clientes');
    const duplicado = await col.findOne({
      $or: [
        { cedula },
        { telefono: telefono || 'SKIP' },
        { nombre, apellido }
      ]
    });

    if (duplicado) {
      if (duplicado.cedula === cedula) return res.status(409).json({ error: 'Ya existe un cliente con esa cédula' });
      if (telefono && duplicado.telefono === telefono) return res.status(409).json({ error: 'El teléfono ya está registrado' });
      if (duplicado.nombre === nombre && duplicado.apellido === apellido)
        return res.status(409).json({ error: 'Ya existe un cliente con ese nombre y apellido' });
    }

    const cliente = { nombre, apellido, cedula, telefono, email, rut_pdf: req.file ? req.file.filename : null, fecha_registro: new Date() };
    const result = await col.insertOne(cliente);
    res.status(201).json({ id: result.insertedId, ...cliente });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clientes/:id', authMiddleware, upload.single('rut_pdf'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { nombre, apellido, cedula, telefono, email } = req.body;
    const update = { nombre, apellido, cedula, telefono, email };
    if (req.file) update.rut_pdf = req.file.filename;
    await mongoDb.collection('clientes').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ mensaje: 'Cliente actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clientes/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await mongoDb.collection('clientes').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clientes/rut/:filename', authMiddleware, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// ═══════════════ MÓDULO EXTRA: ODONTÓLOGOS ═══════════════
app.get('/api/odontologos', authMiddleware, async (req, res) => {
  try { res.json(await mongoDb.collection('odontologos').find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/odontologos', authMiddleware, async (req, res) => {
  try {
    const { nombre, apellido, especialidad, telefono } = req.body;
    if (!nombre || !apellido || !especialidad) return res.status(400).json({ error: 'Faltan datos obligatorios' });

    const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    const soloNumeros = /^[0-9]+$/;
    if (!soloLetras.test(nombre) || !soloLetras.test(apellido))
      return res.status(400).json({ error: 'Nombre/Apellido no pueden contener números' });
    if (telefono && (!soloNumeros.test(telefono) || telefono.length < 10))
      return res.status(400).json({ error: 'Teléfono inválido (mínimo 10 dígitos numéricos)' });

    const col = mongoDb.collection('odontologos');
    const duplicado = await col.findOne({ $or: [{ nombre, apellido }, { telefono: telefono || 'SKIP' }] });
    if (duplicado) return res.status(409).json({ error: 'Ya existe un odontólogo con estos datos (nombre o teléfono)' });

    const result = await col.insertOne({ nombre, apellido, especialidad, telefono, fecha_registro: new Date() });
    res.status(201).json({ id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/odontologos/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { nombre, apellido, especialidad, telefono } = req.body;
    await mongoDb.collection('odontologos').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { nombre, apellido, especialidad, telefono } });
    res.json({ mensaje: 'Odontólogo actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/odontologos/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await mongoDb.collection('odontologos').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Odontólogo eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════ MÓDULO EXTRA: CITAS ═══════════════
app.get('/api/citas', authMiddleware, async (req, res) => {
  try { res.json(await mongoDb.collection('citas').find().sort({ fechaHora: -1 }).toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/citas', authMiddleware, async (req, res) => {
  try {
    const { idPaciente, idOdontologo, fechaHora, estado, motivo } = req.body;
    if (!idPaciente || !idOdontologo || !fechaHora) return res.status(400).json({ error: 'Faltan datos obligatorios' });

    const nuevaFecha = new Date(fechaHora.replace(' ', 'T'));
    if (isNaN(nuevaFecha)) return res.status(400).json({ error: 'Formato de fecha inválido' });
    if (nuevaFecha.getFullYear() !== 2026) return res.status(400).json({ error: 'Solo se permiten citas para el año 2026' });

    const nuevaMs = nuevaFecha.getTime();
    const margenMs = 2 * 60 * 60 * 1000;

    console.log(`🔍 Validando cita: Paciente=${idPaciente}, Odo=${idOdontologo}, Fecha=${fechaHora}`);

    // Obtener citas del mismo día/rango aproximado
    const citasCercanas = await mongoDb.collection('citas').find({
      estado: { $ne: 'Cancelada' }
    }).toArray();

    for (const c of citasCercanas) {
      // Normalizar IDs para comparación (pueden venir como string u ObjectId)
      const cOdoId = String(c.idOdontologo);
      const cPacId = String(c.idPaciente);

      const matchOdo = (cOdoId === String(idOdontologo));
      const matchPac = (cPacId === String(idPaciente));

      if (matchOdo || matchPac) {
        const cFecha = new Date(c.fechaHora.replace(' ', 'T'));
        if (isNaN(cFecha)) continue;

        const diff = Math.abs(nuevaMs - cFecha.getTime());
        if (diff < margenMs) {
          const motivo = matchOdo ? 'El odontólogo' : 'El paciente';
          console.log(`❌ Conflicto detectado con cita ID: ${c._id}`);
          return res.status(409).json({ error: `Conflicto: ${motivo} ya tiene una cita programada en ${c.fechaHora}. Debe haber 2 horas de diferencia.` });
        }
      }
    }

    const result = await mongoDb.collection('citas').insertOne({ idPaciente, idOdontologo, fechaHora, estado: estado || 'Pendiente', motivo, fecha_registro: new Date() });
    res.status(201).json({ id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/citas/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { idPaciente, idOdontologo, fechaHora, estado, motivo } = req.body;

    if (fechaHora && idOdontologo && idPaciente) {
      const nuevaFecha = new Date(fechaHora.replace(' ', 'T'));
      if (isNaN(nuevaFecha)) return res.status(400).json({ error: 'Fecha inválida' });
      if (nuevaFecha.getFullYear() !== 2026) return res.status(400).json({ error: 'Solo se permiten citas para el año 2026' });

      const nuevaMs = nuevaFecha.getTime();
      const margenMs = 2 * 60 * 60 * 1000;
      const selfId = new ObjectId(req.params.id);

      const citasCercanas = await mongoDb.collection('citas').find({
        $or: [{ idOdontologo }, { idPaciente }],
        estado: { $ne: 'Cancelada' },
        _id: { $ne: selfId }
      }).toArray();

      for (const c of citasCercanas) {
        const cFecha = new Date(c.fechaHora.replace(' ', 'T'));
        if (isNaN(cFecha)) continue;
        const diff = Math.abs(nuevaMs - cFecha.getTime());
        if (diff < margenMs) {
          const ent = (c.idOdontologo === idOdontologo) ? 'El odontólogo' : 'El paciente';
          return res.status(409).json({ error: `Conflicto: ${ent} ya tiene otra cita en ${c.fechaHora}` });
        }
      }
    }

    const update = {};
    if (idPaciente) update.idPaciente = idPaciente;
    if (idOdontologo) update.idOdontologo = idOdontologo;
    if (fechaHora) update.fechaHora = fechaHora;
    if (estado) update.estado = estado;
    if (motivo !== undefined) update.motivo = motivo;
    await mongoDb.collection('citas').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ mensaje: 'Cita actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/citas/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await mongoDb.collection('citas').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Cita eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════ MÓDULO 3: PRODUCTOS (Inventario) ═══════════════
app.get('/api/productos', authMiddleware, async (req, res) => {
  try { res.json(await mongoDb.collection('productos').find().sort({ nombre: 1 }).toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/productos/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const p = await mongoDb.collection('productos').findOne({ _id: new ObjectId(req.params.id) });
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/productos', authMiddleware, async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, categoria } = req.body;
    if (!nombre || precio == null || stock == null) return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    const result = await mongoDb.collection('productos').insertOne({ nombre, descripcion, precio: Number(precio), stock: Number(stock), categoria: categoria || 'general', fecha_creacion: new Date() });
    res.status(201).json({ id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/productos/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { nombre, descripcion, precio, stock, categoria } = req.body;
    await mongoDb.collection('productos').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { nombre, descripcion, precio: Number(precio), stock: Number(stock), categoria } });
    res.json({ mensaje: 'Producto actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/productos/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await mongoDb.collection('productos').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Producto eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════ MÓDULO 4: VENTAS ═══════════════
// ─── GET /api/ventas ─────────────────────────────────────────────────────────
// Lista todas las ventas (para reimpresión)
app.get('/api/ventas', authMiddleware, async (req, res) => {
  try {
    const ventas = await mongoDb.collection('ventas')
      .find()
      .sort({ fecha: -1 })
      .project({ factura_id: 1, cliente_nombre: 1, cliente_cedula: 1, total: 1, fecha: 1 })
      .toArray();
    res.json(ventas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ventas', authMiddleware, async (req, res) => {
  try {
    const { cliente_id, items } = req.body;
    if (!cliente_id || !items || items.length === 0) return res.status(400).json({ error: 'Cliente e ítems son requeridos' });
    for (const item of items) {
      const prod = await mongoDb.collection('productos').findOne({ _id: new ObjectId(item.producto_id) });
      if (!prod) return res.status(404).json({ error: `Producto ${item.producto_id} no encontrado` });
      if (prod.stock < item.cantidad) return res.status(400).json({ error: `Sin stock para: ${prod.nombre}` });
      item._nombre = prod.nombre; item._precio = prod.precio; item._subtotal = prod.precio * item.cantidad;
    }
    const cliente = await mongoDb.collection('clientes').findOne({ _id: new ObjectId(cliente_id) });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    const total = items.reduce((acc, i) => acc + i._subtotal, 0);
    const factura_id = `FAC-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const venta = {
      factura_id, cliente_id: new ObjectId(cliente_id), cliente_nombre: `${cliente.nombre} ${cliente.apellido}`, cliente_cedula: cliente.cedula,
      items: items.map(i => ({ producto_id: new ObjectId(i.producto_id), nombre: i._nombre, cantidad: i.cantidad, precio_unitario: i._precio, subtotal: i._subtotal })),
      total, fecha: new Date(), vendedor: req.user.email
    };
    await mongoDb.collection('ventas').insertOne(venta);
    for (const item of items) await mongoDb.collection('productos').updateOne({ _id: new ObjectId(item.producto_id) }, { $inc: { stock: -item.cantidad } });
    res.status(201).json(venta);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ventas/:factura_id/pdf', authMiddleware, async (req, res) => {
  try {
    const venta = await mongoDb.collection('ventas').findOne({ factura_id: req.params.factura_id });
    if (!venta) return res.status(404).json({ error: 'Factura no encontrada' });
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${venta.factura_id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fillColor('#1e40af').fontSize(24).text('OdontoSys', { align: 'left' });
    doc.fillColor('#64748b').fontSize(10).text('Clínica Odontológica Profesional', { align: 'left' });
    doc.moveDown();

    // Invoice Info
    doc.fillColor('#000000').fontSize(20).text('FACTURA DE VENTA', { align: 'right' });
    doc.fontSize(12).text(`Nº: ${venta.factura_id}`, { align: 'right' });
    doc.text(`Fecha: ${new Date(venta.fecha).toLocaleString('es-CO')}`, { align: 'right' });
    doc.moveDown();

    // Line
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown();

    // Client Info
    doc.fontSize(12).fillColor('#1e40af').text('DATOS DEL CLIENTE');
    doc.fillColor('#000000').text(`Nombre: ${venta.cliente_nombre}`);
    doc.text(`Cédula: ${venta.cliente_cedula}`);
    doc.text(`Vendedor: ${venta.vendedor}`);
    doc.moveDown();

    // Table Header
    const tableTop = doc.y + 10;
    doc.rect(50, tableTop, 500, 20).fill('#f8fafc');
    doc.fillColor('#1e40af').fontSize(10);
    doc.text('PRODUCTO', 60, tableTop + 5);
    doc.text('CANT.', 300, tableTop + 5);
    doc.text('P. UNIT', 380, tableTop + 5);
    doc.text('SUBTOTAL', 480, tableTop + 5);

    // Table Items
    let currentY = tableTop + 25;
    doc.fillColor('#000000');
    for (const item of venta.items) {
      doc.text(item.nombre, 60, currentY);
      doc.text(String(item.cantidad), 300, currentY);
      doc.text(`$${item.precio_unitario.toLocaleString()}`, 380, currentY);
      doc.text(`$${item.subtotal.toLocaleString()}`, 480, currentY);
      currentY += 20;
    }

    // Footer Line
    doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor('#e2e8f0').stroke();
    doc.moveDown();

    // Total
    doc.fontSize(16).fillColor('#1e40af').text(`TOTAL A PAGAR: $${venta.total.toLocaleString('es-CO')}`, { align: 'right' });

    doc.fontSize(10).fillColor('#64748b').text('¡Gracias por su compra!', 50, 700, { align: 'center' });
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════ MÓDULO 5: CAJA ═══════════════
app.get('/api/caja', authMiddleware, async (req, res) => {
  try {
    const ventas = await mongoDb.collection('ventas').find().sort({ fecha: -1 }).toArray();
    const total = ventas.reduce((acc, v) => acc + v.total, 0);
    res.json({ total_acumulado: total, ventas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/caja/pdf', authMiddleware, async (req, res) => {
  try {
    const ventas = await mongoDb.collection('ventas').find().sort({ fecha: -1 }).toArray();
    const total = ventas.reduce((acc, v) => acc + v.total, 0);
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_caja.pdf"');
    doc.pipe(res);

    // Header
    doc.fillColor('#1e40af').fontSize(24).text('OdontoSys', { align: 'left' });
    doc.fillColor('#64748b').fontSize(10).text('Reporte Financiero de Caja', { align: 'left' });
    doc.moveDown();

    doc.fillColor('#000000').fontSize(18).text('RESUMEN DE CAJA', { align: 'center' });
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-CO')}`, { align: 'center' });
    doc.moveDown();

    // Total Box
    doc.rect(50, doc.y, 500, 40).fill('#1e40af');
    doc.fillColor('#ffffff').fontSize(16).text(`SALDO TOTAL ACUMULADO: $${total.toLocaleString('es-CO')}`, 60, doc.y + 12, { align: 'center' });
    doc.moveDown(2);

    // Table Header
    doc.fillColor('#1e40af').fontSize(10).text('HISTORIAL DE VENTAS');
    doc.moveDown(0.5);
    const tableTop = doc.y;
    doc.rect(50, tableTop, 500, 20).fill('#f8fafc');
    doc.fillColor('#1e40af');
    doc.text('FACTURA', 60, tableTop + 5);
    doc.text('CLIENTE', 150, tableTop + 5);
    doc.text('FECHA', 350, tableTop + 5);
    doc.text('TOTAL', 480, tableTop + 5);

    // Table Items
    let currentY = tableTop + 25;
    doc.fillColor('#000000');
    for (const v of ventas) {
      if (currentY > 700) { doc.addPage(); currentY = 50; }
      doc.text(v.factura_id, 60, currentY);
      doc.text(v.cliente_nombre.slice(0, 25), 150, currentY);
      doc.text(new Date(v.fecha).toLocaleDateString('es-CO'), 350, currentY);
      doc.text(`$${v.total.toLocaleString('es-CO')}`, 480, currentY);
      currentY += 20;
    }

    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════ MÓDULO EXTRA: GESTIÓN DE USUARIOS ═══════════════
app.get('/api/usuarios', authMiddleware, async (req, res) => {
  try { res.json(await mongoDb.collection('usuarios_sistema').find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/usuarios', authMiddleware, async (req, res) => {
  try {
    const { email, password, rol, nombre } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await mongoDb.collection('usuarios_sistema').insertOne({
      email,
      password: hash,
      plain_password: password,
      rol: rol || 'USUARIO',
      nombre: nombre || email,
      fecha_registro: new Date()
    });
    res.status(201).json({ id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { username, email, password, rol, nombre } = req.body;
    const update = {};
    if (username) update.username = username;
    if (email) update.email = email;
    if (rol) update.rol = rol;
    if (nombre) update.nombre = nombre;
    if (password) {
      update.password = await bcrypt.hash(password, 10);
      update.plain_password = password;
    }
    await mongoDb.collection('usuarios_sistema').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ mensaje: 'Usuario actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    if (String(req.user.id) === req.params.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    await mongoDb.collection('usuarios_sistema').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, async () => {
  console.log('═════════════════\n  OdontoSys — Servidor iniciado\n  http://localhost:' + PORT + '\n═════════════════');
  await connectMongo();
  await connectPG();
});

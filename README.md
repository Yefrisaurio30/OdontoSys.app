# 🦷 OdontoSys — Sistema de Gestión Odontológica Profesional

Sistema integral para la gestión de clínicas odontológicas con arquitectura cliente-servidor, seguridad JWT, base de datos híbrida (MongoDB Atlas + PostgreSQL) y generación de reportes PDF.

---

## 📂 Estructura de Archivos

| Archivo | Descripción |
|---------|-------------|
| `server.js` | **Servidor principal** — API REST completa con Express.js |
| `app.js` | **Utilidades del frontend** — Sesión, toasts, barra superior |
| `DAOHybrid.js` | **Capa de acceso a datos (frontend)** — Abstracción de fetch |
| `MongoDB.js` | **DAO alternativo** — Cliente directo para MongoDB (legacy) |
| `seed.js` | **Script de inicialización** — Crea usuarios y datos de prueba |
| `styles.css` | **Estilos globales** — Diseño premium del sistema |
| `.env` | **Variables de entorno** — Credenciales y configuración |
| `vercel.json` | **Configuración de deploy** — Rutas para Vercel/Render |
| `package.json` | **Dependencias** — Librerías npm del proyecto |

### Páginas HTML

| Página | Módulo |
|--------|--------|
| `index.html` | Pantalla de login principal |
| `login.html` | Login alternativo (legacy) |
| `registro.html` | Registro de nuevos usuarios |
| `recuperar.html` | Solicitud de recuperación de contraseña |
| `reset.html` | Formulario para establecer nueva contraseña |
| `menu.html` | Menú principal (Admin o Paciente) |
| `pacientes.html` | CRUD de pacientes con subida de RUT |
| `odontologos.html` | CRUD de odontólogos |
| `citas.html` | Gestión de citas (Admin) |
| `agendar-cita.html` | Agendar cita (Paciente) |
| `mis-citas.html` | Ver mis citas (Paciente) |
| `inventario.html` | CRUD de productos/stock |
| `ventas.html` | Punto de venta + carrito + historial |
| `caja.html` | Saldo acumulado + reporte PDF |
| `usuarios.html` | Gestión de cuentas del sistema |
| `clientes.html` | Vista alternativa de clientes |

---

## 🛠️ Tecnologías y Dependencias

```json
{
  "express": "Framework web para crear la API REST",
  "mongodb": "Driver oficial para conectar con MongoDB Atlas",
  "pg": "Driver para PostgreSQL (soporte secundario)",
  "bcryptjs": "Encriptación de contraseñas con hash seguro",
  "jsonwebtoken": "Generación y verificación de tokens JWT",
  "multer": "Subida de archivos (PDFs de RUT)",
  "pdfkit": "Generación de facturas y reportes en PDF",
  "nodemailer": "Envío de correos electrónicos",
  "dotenv": "Carga de variables de entorno desde .env",
  "cors": "Permitir peticiones entre dominios",
  "uuid": "Generación de IDs únicos para facturas"
}
```

---

## ⚙️ Configuración del Entorno (.env)

```env
# MongoDB Atlas — Cadena de conexión al cluster
MONGO_URI="mongodb+srv://usuario:clave@cluster.mongodb.net/DATAACCESS"
MONGO_DB=DATAACCESS

# Puerto del servidor
PORT=3001

# PostgreSQL (soporte secundario)
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=1234
PG_DB=odontosys

# Clave secreta para firmar tokens JWT
JWT_SECRET=una_clave_secreta_muy_larga

# Email — Configuración de Gmail
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=clave_de_aplicacion_16_caracteres

# Brevo API — Para envío de emails en producción (Render)
BREVO_API_KEY=tu_api_key_de_brevo
BREVO_SMTP_USER=tu_correo@gmail.com
```

---

## 📝 Instrucciones de Uso

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar el archivo .env con tus credenciales

# 3. (Opcional) Poblar la base de datos con datos de prueba
node seed.js

# 4. Iniciar el servidor
npm start
# o
node server.js

# 5. Abrir en el navegador
# http://localhost:3001
```

---

# 📖 DOCUMENTACIÓN COMPLETA DEL CÓDIGO

## 1. `server.js` — Servidor Principal (API REST)

Este es el corazón del sistema. Contiene **toda la lógica del backend**: conexiones a bases de datos, autenticación, rutas API y generación de PDFs.

### 1.1 Importaciones y Configuración Inicial (líneas 1-50)

```javascript
require('dotenv').config();          // Carga las variables del archivo .env
const express = require('express');   // Framework web
const cors = require('cors');         // Permite peticiones de otros dominios
const { MongoClient, ObjectId } = require('mongodb'); // Driver de MongoDB
const { Pool } = require('pg');       // Driver de PostgreSQL
const bcrypt = require('bcryptjs');    // Encriptación de contraseñas
const jwt = require('jsonwebtoken');   // Tokens de autenticación
const multer = require('multer');      // Subida de archivos
const PDFDocument = require('pdfkit'); // Generación de PDFs
const { v4: uuidv4 } = require('uuid'); // IDs únicos
```

**¿Para qué sirve cada uno?**
- `dotenv` → Lee el archivo `.env` y pone sus valores en `process.env`
- `express` → Crea el servidor HTTP y maneja las rutas (`GET`, `POST`, `PUT`, `DELETE`)
- `cors` → Sin esto, el navegador bloquearía las peticiones al servidor
- `mongodb` → Se conecta a MongoDB Atlas en la nube para leer/escribir datos
- `bcryptjs` → Convierte contraseñas en texto plano a hashes seguros (irreversibles)
- `jwt` → Crea "tarjetas de identidad digital" que el usuario envía en cada petición
- `multer` → Recibe archivos PDF que el usuario sube desde el formulario
- `pdfkit` → Dibuja documentos PDF programáticamente (facturas, reportes)
- `uuid` → Genera códigos únicos tipo `FAC-2026-A1B2C3D4` para las facturas

### 1.2 Configuración de Multer — Subida de Archivos (líneas 33-50)

```javascript
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, `rut_${Date.now()}_${file.originalname}`)
});
```

- `destination` → Define que los archivos se guardan en la carpeta `/uploads`
- `filename` → Renombra cada archivo con un prefijo `rut_` + timestamp para evitar duplicados
- `fileFilter` → Solo acepta archivos con tipo MIME `application/pdf`
- `limits` → Tamaño máximo: 5 MB

### 1.3 Sistema de Email con Brevo API (líneas 52-95)

```javascript
async function sendEmail({ to, subject, html }) { ... }
```

**¿Qué hace?** Envía correos electrónicos usando la API HTTP de Brevo (antes Sendinblue).

**¿Por qué Brevo y no Gmail directo?** Render (plataforma de deploy) bloquea todos los puertos SMTP (25, 465, 587). Brevo usa HTTP (puerto 443), que sí funciona.

**Flujo:**
1. Verifica que `BREVO_API_KEY` exista en las variables de entorno
2. Hace un `POST` a `https://api.brevo.com/v3/smtp/email` con el destinatario, asunto y HTML
3. Si la respuesta no es OK, lanza un error con el mensaje de Brevo

### 1.4 Conexión a MongoDB Atlas (líneas 99-137)

```javascript
async function connectMongo() { ... }
```

**¿Qué hace?** Establece la conexión con MongoDB Atlas (base de datos en la nube).

**Flujo:**
1. Verifica que `MONGO_URI` esté definida
2. Crea un `MongoClient` con timeouts configurados (20s conexión, 45s socket)
3. Ejecuta `ping` para verificar la conexión
4. Si falla, reintenta automáticamente cada 20 segundos
5. En Windows, configura DNS de Google (`8.8.8.8`) para resolver problemas con el protocolo SRV de Atlas

### 1.5 Conexión a PostgreSQL (líneas 139-151)

```javascript
const pgPool = new Pool({ host, port, user, password, database });
async function connectPG() { ... }
```

**¿Qué hace?** Crea un pool de conexiones a PostgreSQL. Se usa como soporte secundario. Si no hay PostgreSQL disponible, el error se ignora silenciosamente.

### 1.6 Middleware de Autenticación (líneas 153-174)

```javascript
const authMiddleware = (req, res, next) => { ... }
```

**¿Qué hace?** Verifica que cada petición a la API tenga un token JWT válido.

**Flujo:**
1. Busca el token en el header `Authorization: Bearer <token>` o en `?token=` (query param)
2. Si no hay token → responde `401 Sin autorización`
3. Usa `jwt.verify()` para decodificar el token con el `JWT_SECRET`
4. Si es válido, coloca los datos del usuario en `req.user` y continúa
5. Si es inválido o expirado → responde `401 Token inválido`

**¿Dónde se usa?** En **todas** las rutas excepto `/api/auth/login`, `/api/auth/registrar`, `/api/auth/recuperar` y `/api/auth/reset`.

### 1.7 Módulo de Autenticación — Rutas `/api/auth/*` (líneas 178-311)

#### `POST /api/auth/login`
```javascript
app.post('/api/auth/login', async (req, res) => { ... });
```
- Recibe `email` (o username) y `password`
- Busca en MongoDB por email **O** por username (`$or`)
- Compara la contraseña con `bcrypt.compare()`
- Si es correcta, genera un JWT con `jwt.sign()` válido por 8 horas
- Devuelve: `{ token, id, username, nombre, rol }`

#### `POST /api/auth/registrar`
```javascript
app.post('/api/auth/registrar', async (req, res) => { ... });
```
- Recibe: username, email, password, nombre, apellido, cedula, telefono
- **Validaciones:**
  - Email debe ser `@gmail.com` (para recuperación)
  - Nombre/Apellido solo letras (regex `^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$`)
  - Cédula solo números
  - Teléfono mínimo 10 dígitos
- **Duplicados:** Verifica que no exista otro usuario con el mismo username, email, cédula, teléfono o nombre+apellido
- Encripta la contraseña con `bcrypt.hash(password, 10)` (10 rondas de sal)
- Crea el usuario en `usuarios_sistema` Y un registro en `clientes` automáticamente

#### `POST /api/auth/recuperar`
```javascript
app.post('/api/auth/recuperar', async (req, res) => { ... });
```
- Recibe un email, busca al usuario
- Genera un token aleatorio de 64 caracteres con `crypto.randomBytes(32)`
- Guarda el token y su fecha de expiración (1 hora) en la BD
- Construye la URL de reset: `https://dominio/reset.html?token=abc123...`
- Envía el correo con `sendEmail()` conteniendo un botón de reset

#### `POST /api/auth/reset`
```javascript
app.post('/api/auth/reset', async (req, res) => { ... });
```
- Recibe el token de recuperación y la nueva contraseña
- Busca un usuario que tenga ese token **y** que no haya expirado (`$gt: new Date()`)
- Encripta la nueva contraseña y actualiza en la BD
- Invalida el token (lo pone en `null`)

### 1.8 Módulo de Clientes/Pacientes — Rutas `/api/clientes/*` (líneas 313-400)

| Ruta | Método | Función |
|------|--------|---------|
| `/api/clientes` | GET | Lista todos los clientes ordenados por fecha |
| `/api/clientes/buscar?cedula=X` | GET | Busca un cliente por su cédula exacta |
| `/api/clientes/:id` | GET | Obtiene un cliente por su ID de MongoDB |
| `/api/clientes` | POST | Crea un nuevo cliente (con validaciones y subida de RUT) |
| `/api/clientes/:id` | PUT | Actualiza datos de un cliente |
| `/api/clientes/:id` | DELETE | Elimina un cliente |
| `/api/clientes/rut/:filename` | GET | Descarga el archivo PDF del RUT |

**Validaciones del POST:**
- Nombre y apellido: solo letras
- Cédula: solo números, no duplicada
- Teléfono: mínimo 10 dígitos, no duplicado
- Nombre+Apellido: combinación única

### 1.9 Módulo de Odontólogos — Rutas `/api/odontologos/*` (líneas 402-444)

CRUD estándar con validaciones similares a clientes. Cada odontólogo tiene: nombre, apellido, especialidad y teléfono.

### 1.10 Módulo de Citas — Rutas `/api/citas/*` (líneas 446-545)

#### `POST /api/citas` — Crear cita
```javascript
app.post('/api/citas', authMiddleware, async (req, res) => { ... });
```

**Lógica anti-colisión:**
1. Solo permite citas en el año 2026
2. Busca TODAS las citas no canceladas
3. Para cada cita existente, verifica si el odontólogo o el paciente ya tienen una cita dentro de un margen de **2 horas**
4. Si hay conflicto → responde `409 Conflicto` con un mensaje descriptivo
5. Si no hay conflicto → crea la cita con estado "Pendiente"

#### `PUT /api/citas/:id` — Editar cita
Misma lógica anti-colisión pero excluye la cita que se está editando (por su `_id`).

### 1.11 Módulo de Productos/Inventario — Rutas `/api/productos/*` (líneas 547-586)

CRUD estándar. Cada producto tiene: nombre, descripción, precio, stock y categoría. Los valores numéricos se convierten con `Number()` antes de guardarlos.

### 1.12 Módulo de Ventas — Rutas `/api/ventas/*` (líneas 588-688)

#### `POST /api/ventas` — Registrar venta
```javascript
app.post('/api/ventas', authMiddleware, async (req, res) => { ... });
```

**Flujo completo:**
1. Recibe `cliente_id` y un array de `items` (producto_id + cantidad)
2. Para cada item, verifica que el producto exista y tenga stock suficiente
3. Busca los datos del cliente en la BD
4. Calcula el total sumando los subtotales
5. Genera un ID de factura: `FAC-2026-` + 8 caracteres UUID en mayúsculas
6. Guarda la venta con todos los datos (cliente, items, total, vendedor, fecha)
7. **Descuenta el stock** de cada producto con `$inc: { stock: -cantidad }`
8. Devuelve la venta completa para generar el PDF

#### `GET /api/ventas/:factura_id/pdf` — Generar factura PDF
```javascript
app.get('/api/ventas/:factura_id/pdf', authMiddleware, async (req, res) => { ... });
```

Usa **PDFKit** para dibujar el PDF programáticamente:
1. Header con logo "OdontoSys" en azul
2. Info de factura (número, fecha) alineada a la derecha
3. Línea divisoria decorativa
4. Datos del cliente (nombre, cédula, vendedor)
5. Tabla con columnas: Producto, Cantidad, P. Unitario, Subtotal
6. Línea de cierre y total a pagar
7. Pie de página con mensaje de agradecimiento

### 1.13 Módulo de Caja — Rutas `/api/caja/*` (líneas 690-747)

#### `GET /api/caja`
Obtiene todas las ventas y calcula el total acumulado con `reduce()`.

#### `GET /api/caja/pdf` — Reporte PDF de caja
Genera un PDF con:
- Header "OdontoSys — Reporte Financiero de Caja"
- Cuadro azul con el saldo total acumulado
- Tabla del historial: Factura, Cliente, Fecha, Total
- Paginación automática cuando `currentY > 700`

### 1.14 Módulo de Usuarios — Rutas `/api/usuarios/*` (líneas 749-796)

CRUD de cuentas del sistema. Incluye protección para que un usuario no pueda eliminarse a sí mismo (`req.user.id !== req.params.id`).

### 1.15 Arranque del Servidor (líneas 801-805)

```javascript
app.listen(PORT, async () => {
  await connectMongo();
  await connectPG();
});
```

Al arrancar, conecta simultáneamente a MongoDB y PostgreSQL.

---

## 2. `app.js` — Utilidades del Frontend

### 2.1 Objeto `Session` — Gestión de Sesión

```javascript
const Session = {
  set(usuario)    // Guarda usuario en localStorage + memoria
  get()           // Recupera la sesión actual
  clear()         // Elimina toda la sesión (logout)
  isAdmin()       // Retorna true si el rol es 'ADMIN'
  requireLogin()  // Redirige al login si no hay sesión
  requireAdmin()  // Redirige al menú si no es admin
};
```

**¿Cómo funciona?**
- `set()` → Guarda dos cosas en localStorage: `odonto_session` (JSON del usuario) y `token` (JWT)
- `get()` → Primero busca en memoria, luego en localStorage. Si los datos están corruptos, limpia todo
- `requireLogin()` → Cada página protegida llama esto al cargar. Si no hay sesión → `index.html`

### 2.2 Función `showToast()` — Notificaciones

```javascript
function showToast(msg, type = 'success') { ... }
```

Crea notificaciones tipo toast (aparecen arriba a la derecha):
- Tipos: `success` ✓, `error` ✕, `warning` ⚠, `info` ℹ
- Se auto-eliminan después de 3 segundos con animación de fade-out

### 2.3 Función `confirmDialog()` — Modal de confirmación

```javascript
function confirmDialog(title, message) { ... }
```

Retorna una **Promise** que se resuelve con `true` (confirmar) o `false` (cancelar). Usa clonación de nodos para evitar acumulación de event listeners.

### 2.4 Función `renderTopBar()` — Barra superior

```javascript
function renderTopBar(title) { ... }
```

Genera el HTML de la barra superior con:
- Logo 🦷 OdontoSys + título de la página
- Avatar con las iniciales del usuario
- Nombre y rol del usuario
- Botón "← Menú" y "Cerrar sesión"

---

## 3. `DAOHybrid.js` — Capa de Acceso a Datos

### 3.1 Método `request()` — Petición base

```javascript
async request(endpoint, method = 'GET', body = null, isFormData = false) { ... }
```

**¿Qué hace?** Es el método central que todas las funciones del DAO utilizan. Maneja:
- Header `Authorization: Bearer <token>` automáticamente
- Envío de JSON o FormData según el parámetro `isFormData`
- **Detección de sesión expirada:** Si recibe `401`, limpia la sesión y redirige al login
- Parsing automático del JSON de respuesta

### 3.2 Funciones por Módulo

| Módulo | Funciones |
|--------|-----------|
| **Auth** | `login()`, `registrar()`, `recuperar()`, `resetPassword()` |
| **Pacientes** | `getPacientes()`, `getPaciente(id)`, `addPaciente()`, `updatePaciente()`, `deletePaciente()` |
| **Odontólogos** | `getOdontologos()`, `addOdontologo()`, `updateOdontologo()`, `deleteOdontologo()` |
| **Citas** | `getCitas()`, `addCita()`, `updateCita()`, `deleteCita()` |
| **Productos** | `getProductos()`, `getProducto(id)`, `addProducto()`, `updateProducto()`, `deleteProducto()` |
| **Ventas** | `getVentas()`, `addVenta()`, `getCaja()` |
| **Usuarios** | `getUsuarios()`, `addUsuario()`, `updateUsuario()`, `deleteUsuario()` |

### 3.3 Sistema de Caché

```javascript
async loadNombreCache() { ... }
nombrePaciente(id)       // Busca en caché de pacientes → luego en usuarios
nombreOdontologo(id)     // Busca en caché y agrega "Dr." al inicio
```

**¿Para qué sirve?** Las citas guardan IDs de paciente/odontólogo. Para mostrar nombres en la tabla, se cargan todos los pacientes y odontólogos una sola vez en memoria y se buscan por ID sin hacer peticiones adicionales.

---

## 4. `MongoDB.js` — DAO Legacy

Contiene `MongoDAO` (cliente directo sin autenticación JWT) y `mongoExport` con dos funciones de exportación:

- `toXLSX(data)` → Genera un archivo Excel/TSV descargable
- `toPDF(data, titulo)` → Genera un HTML con tabla imprimible

> **Nota:** Este archivo es legacy. El sistema activo usa `DAOHybrid.js`.

---

## 5. `seed.js` — Script de Inicialización

```bash
node seed.js
```

**¿Qué crea?**
1. **Usuario Admin:** `admin` / `admin123` (rol ADMIN)
2. **Usuario Normal:** `Yefri` / `Yefri` (rol USUARIO)
3. **2 pacientes** de prueba (Juan Pérez, Maria Gomez)
4. **2 productos** de prueba (Resina A2, Guantes de Látex)

Usa `updateOne` con `upsert: true` para no duplicar datos si se ejecuta varias veces.

---

## 6. Flujos Principales del Sistema

### 🔐 Flujo de Login
```
index.html → DAO.login() → POST /api/auth/login → MongoDB busca usuario
  → bcrypt.compare() → jwt.sign() → Token JWT (8h) → Session.set() → menu.html
```

### 🔄 Flujo de Recuperación de Contraseña
```
recuperar.html → POST /api/auth/recuperar → Genera token aleatorio
  → Guarda en BD con expiración 1h → sendEmail() via Brevo API
  → Usuario recibe email → Click enlace → reset.html?token=XXX
  → POST /api/auth/reset → Verifica token → bcrypt.hash() nueva contraseña → Listo
```

### 🛒 Flujo de Venta
```
ventas.html → Buscar cliente por cédula → Agregar productos al carrito
  → POST /api/ventas → Verifica stock → Calcula totales → Genera factura_id
  → Guarda venta → Descuenta stock → Abre PDF en nueva pestaña
```

### 📄 Flujo de Generación de PDF
```
GET /api/ventas/:id/pdf → Busca venta en MongoDB
  → new PDFDocument() → Dibuja header, datos, tabla, total
  → doc.pipe(res) → Streaming directo al navegador
```

---

## ⚠️ Solución de Problemas Comunes

| Problema | Solución |
|----------|----------|
| "Token inválido" | El servidor se reinició o la sesión expiró. Cierra sesión y vuelve a entrar |
| Error enviando correo | Verifica que `BREVO_API_KEY` sea correcta y que en Brevo no haya restricción de IPs |
| Error de conexión MongoDB | Verifica tu IP en "Network Access" de MongoDB Atlas. Agrega `0.0.0.0/0` para permitir todas |
| DNS/SRV error en Windows | El servidor ya fuerza DNS de Google (8.8.8.8), pero verifica tu conexión a internet |
| "No puedes eliminarte a ti mismo" | Protección del sistema: un admin no puede borrar su propia cuenta |
| Archivos RUT no se guardan | Verifica que la carpeta `/uploads` exista y que el archivo sea PDF ≤ 5MB |

---

## 🔒 Seguridad del Sistema

1. **Contraseñas:** Hasheadas con bcrypt (10 rondas de sal) — nunca se guardan en texto plano visible
2. **JWT:** Tokens firmados con clave secreta, expiran en 8 horas
3. **Middleware:** Todas las rutas de datos requieren autenticación
4. **Validación de entrada:** Regex para nombres, cédulas, teléfonos
5. **Protección de duplicados:** Verificación en servidor antes de crear registros
6. **Archivos:** Solo PDFs, máximo 5 MB, renombrados con timestamp

---

*Desarrollado para el Parcial Final de Bases de Datos — 2026*
*OdontoSys — Sistema de Gestión de Clínicas Dentales*
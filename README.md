# 🦷 OdontoSys — Sistema de Gestión Odontológica Profesional

Sistema integral para la gestión de clínicas odontológicas, diseñado con una arquitectura robusta, seguridad basada en JWT y una base de datos híbrida (enfocada en MongoDB Atlas).

---

## 🚀 Mejoras Recientes (Mayo 2026)

He realizado las siguientes actualizaciones críticas para garantizar la estabilidad del sistema:

- **Sincronización de Sesión**: Se corrigió un error donde el token de seguridad no se guardaba correctamente al iniciar sesión desde `index.html`.
- **Manejo de Errores de Autenticación**: El sistema ahora detecta automáticamente si un token ha expirado o es inválido, redirigiendo al usuario al login de forma segura (evitando bloqueos).
- **Seguridad Reforzada**: Implementación de logs detallados en el servidor para rastrear errores de verificación de JWT.
- **Persistencia de Token**: Se unificó el almacenamiento en `localStorage` para que todos los módulos (Ventas, Citas, Pacientes) utilicen la misma clave de acceso.

---

## 🛠️ Tecnologías y Arquitectura

### Backend (Node.js)
- **Express**: Framework principal del servidor.
- **MongoDB Atlas**: Base de datos principal para Pacientes, Citas, Inventario, Ventas y Usuarios.
- **PostgreSQL**: Soporte para datos relacionales secundarios.
- **JWT (JSON Web Tokens)**: Seguridad y autorización de rutas.
- **Nodemailer**: Sistema de recuperación de contraseñas vía Email (Gmail).
- **PDFKit**: Generación automática de Facturas y Reportes de Caja en PDF.

### Frontend (Vanilla JS / HTML5 / CSS3)
- **Arquitectura DAO**: Capa de abstracción de datos en `DAOHybrid.js` para desacoplar el frontend del backend.
- **Diseño Premium**: Interfaz moderna, responsiva y con micro-animaciones.
- **Toasts & Modales**: Sistema de notificaciones integradas para una mejor experiencia de usuario.

---

## 📂 Estructura del Proyecto

### Núcleo
| Archivo | Función |
|---------|---------|
| `server.js` | El motor del sistema. Maneja la API, la seguridad y la conexión a las bases de datos. |
| `DAOHybrid.js` | El puente entre el navegador y el servidor. Maneja todas las peticiones fetch. |
| `app.js` | Utilidades globales: gestión de sesiones, alertas (Toasts) y renderizado de la barra superior. |
| `.env` | **CRÍTICO**: Contiene las credenciales de MongoDB, PostgreSQL y Gmail. |

### Módulos de Usuario
- **Login / Registro**: `index.html`, `registro.html`.
- **Recuperación**: `recuperar.html`, `reset.html` (usa tokens de un solo uso).
- **Pacientes**: `pacientes.html` (Gestión completa con subida de RUT en PDF).
- **Citas**: `agendar-cita.html`, `mis-citas.html`, `citas.html` (Evita cruces de horario).
- **Ventas**: `ventas.html` (Carrito de compras y generación de facturas PDF).
- **Finanzas**: `caja.html` (Reporte de ganancias acumuladas y descarga de resumen PDF).

---

## ⚙️ Configuración del Entorno (.env)

Para que el sistema funcione, debes tener un archivo `.env` en la raíz con lo siguiente:

```env
# MongoDB Atlas
MONGO_URI="tu_cadena_de_conexion_mongodb"
MONGO_DB=DATAACCESS

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=1234
PG_DB=odontosys

# Seguridad
JWT_SECRET=una_clave_secreta_muy_segura

# Email (Gmail con App Password)
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_clave_de_aplicacion_de_16_caracteres
EMAIL_FROM=noreply@odontosys.com
```

---

## 📝 Instrucciones de Uso

1. **Instalación**: Ejecuta `npm install` para descargar las librerías necesarias.
2. **Iniciar**: Ejecuta `node server.js` o `npm start`.
3. **Primer Acceso**:
   - Si es la primera vez, regístrate desde la pantalla principal.
   - **Nota**: El sistema requiere que el correo sea `@gmail.com` para habilitar la recuperación de contraseña.
4. **Módulo de Ventas**: Para realizar una venta, primero debes tener productos en el **Inventario** y clientes registrados en **Pacientes**.

---

## ⚠️ Solución de Problemas Comunes

- **"Token inválido"**: Esto sucede si el servidor se reinició o si tu sesión expiró. Simplemente cierra sesión y vuelve a entrar.
- **Error enviando correo**: Asegúrate de que `EMAIL_PASS` sea una "Contraseña de Aplicación" generada en tu cuenta de Google, no tu contraseña normal.
- **Error de conexión MongoDB**: Verifica que tu IP esté habilitada en la sección "Network Access" de MongoDB Atlas.

---
*Desarrollado para el sistema de gestión de clínicas dentales — 2026*
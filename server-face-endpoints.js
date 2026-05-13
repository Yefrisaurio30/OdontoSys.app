// ═══════════════════════════════════════════════════════
// ENDPOINTS DE RECONOCIMIENTO FACIAL
// Agrega estos endpoints en server.js, antes de la línea:
//   app.use('/uploads', express.static(...))
// ═══════════════════════════════════════════════════════

// ── POST /api/auth/face-register ──────────────────────
// Guarda el descriptor facial promedio de un administrador.
// Requiere token JWT válido (el propio admin).
app.post('/api/auth/face-register', authMiddleware, async (req, res) => {
  try {
    const { descriptor } = req.body;

    // Validaciones
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ error: 'Descriptor facial inválido (debe ser array de 128 números)' });
    }

    const userId = req.user.id;
    const col = mongoDb.collection('usuarios_sistema');

    // Verificar que el usuario existe y es ADMIN
    const user = await col.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.rol !== 'ADMIN' && user.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden registrar reconocimiento facial' });
    }

    // Guardar descriptor
    await col.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          face_descriptor: descriptor,
          face_registered_at: new Date()
        }
      }
    );

    console.log(`✅ Descriptor facial registrado para admin: ${user.email || user.username}`);
    res.json({ mensaje: 'Perfil facial guardado correctamente', userId });

  } catch (e) {
    console.error('Error en face-register:', e);
    res.status(500).json({ error: e.message });
  }
});


// ── GET /api/auth/face-check/:userId ─────────────────
// Verifica si un usuario admin tiene cara registrada.
// Ruta pública (se llama antes de pedir verificación facial).
app.get('/api/auth/face-check/:userId', async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const user = await mongoDb.collection('usuarios_sistema').findOne(
      { _id: new ObjectId(req.params.userId) },
      { projection: { face_descriptor: 1, rol: 1 } }
    );

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      hasFace: !!(user.face_descriptor && user.face_descriptor.length === 128),
      isAdmin: user.rol === 'ADMIN' || user.rol === 'admin'
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── GET /api/auth/face-descriptor/:userId ─────────────
// Devuelve el descriptor facial del admin (protegido con JWT).
// El front-end lo usa para comparar en tiempo real.
app.get('/api/auth/face-descriptor/:userId', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Solo puede pedir su propio descriptor (o un admin)
    if (req.user.id !== req.params.userId && req.user.rol !== 'ADMIN' && req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const user = await mongoDb.collection('usuarios_sistema').findOne(
      { _id: new ObjectId(req.params.userId) },
      { projection: { face_descriptor: 1 } }
    );

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      descriptor: user.face_descriptor || null,
      hasDescriptor: !!(user.face_descriptor)
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── DELETE /api/auth/face-register ────────────────────
// Elimina el descriptor facial de un administrador (borrar registro).
app.delete('/api/auth/face-register', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await mongoDb.collection('usuarios_sistema').updateOne(
      { _id: new ObjectId(userId) },
      { $unset: { face_descriptor: '', face_registered_at: '' } }
    );
    res.json({ mensaje: 'Perfil facial eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

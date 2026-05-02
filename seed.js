require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const dns = require('dns');

// Configuración de DNS para resolver problemas con MongoDB Atlas SRV en Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('⚠️ No se pudo configurar servidores DNS alternativos:', e.message);
}

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || 'DATAACCESS';

async function seed() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    const users = db.collection('usuarios_sistema');

    const clients = db.collection('clientes');

    // 1. USUARIO ADMIN
    const adminEmail = 'admin';
    const adminPass = 'admin123';
    const adminHash = await bcrypt.hash(adminPass, 10);
    
    const adminRes = await users.updateOne(
      { email: adminEmail },
      { $set: { password: adminHash, plain_password: adminPass, nombre: 'Administrador', rol: 'ADMIN', cedula: '111111' } },
      { upsert: true }
    );
    console.log(`✅ Usuario Admin configurado: ${adminEmail} / ${adminPass}`);

    // También en clientes
    await clients.updateOne(
      { cedula: '111111' },
      { $set: { nombre: 'Administrador', apellido: 'Sistema', email: adminEmail, cedula: '111111' } },
      { upsert: true }
    );

    // 2. USUARIO NORMAL
    const yefriEmail = 'Yefri';
    const yefriPass = 'Yefri';
    const yefriHash = await bcrypt.hash(yefriPass, 10);
    
    await users.updateOne(
      { email: yefriEmail },
      { $set: { password: yefriHash, plain_password: yefriPass, nombre: 'Yefri Santiago', rol: 'USUARIO', cedula: '222222' } },
      { upsert: true }
    );
    console.log(`✅ Usuario Normal configurado: ${yefriEmail} / ${yefriPass}`);

    await clients.updateOne(
      { cedula: '222222' },
      { $set: { nombre: 'Yefri', apellido: 'Santiago', email: yefriEmail, cedula: '222222' } },
      { upsert: true }
    );

    console.log('---------------------------');
    console.log('¡Listo! Ya puedes probar el login.');
    console.log('---------------------------');

    // Añadir pacientes de prueba
    const pacientes = db.collection('clientes');
    const countPacientes = await pacientes.countDocuments();
    if (countPacientes === 0) {
      await pacientes.insertMany([
        { nombre: 'Juan', apellido: 'Pérez', cedula: '123456', telefono: '3001234567', email: 'juan@example.com', fecha_registro: new Date() },
        { nombre: 'Maria', apellido: 'Gomez', cedula: '654321', telefono: '3109876543', email: 'maria@example.com', fecha_registro: new Date() }
      ]);
      console.log('✅ Pacientes de prueba creados');
    }

    // Añadir productos de prueba
    const productos = db.collection('productos');
    const countProds = await productos.countDocuments();
    if (countProds === 0) {
      await productos.insertMany([
        { nombre: 'Resina A2', descripcion: 'Resina compuesta fotocurable', precio: 45000, stock: 20, categoria: 'Consumibles', fecha_creacion: new Date() },
        { nombre: 'Guantes de Látex', descripcion: 'Caja x 100 unidades', precio: 25000, stock: 50, categoria: 'Protección', fecha_creacion: new Date() }
      ]);
      console.log('✅ Productos de prueba creados');
    }

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.close();
  }
}

seed();

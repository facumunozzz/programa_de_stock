require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const listEndpoints = require('express-list-endpoints');

const app = express();

app.use(cors());
app.use(express.json());

// Routers
const articulosRouter = require('./routes/articulos');
const depositosRouter = require('./routes/depositos');
const stockRouter = require('./routes/stock');
const transferenciasRouter = require('./routes/transferencias');
const movimientosRouter = require('./routes/movimientos');
const produccionRouter = require('./routes/produccion');
const ajustesRouter = require('./routes/ajustes');
const fabricaRouter = require('./routes/fabrica');
const adminRouter = require('./routes/administracion');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users.js');
const utilidadesRouter = require('./routes/utilidades');
const articuloClasifRouter = require('./routes/articuloClasificaciones');
const clasificacionesRouter = require('./routes/clasificaciones');
const remitosRouter = require('./routes/remitos');
const remitoProveedoresRouter = require('./routes/remitoProveedores');

console.log('[APP] usando articulosRouter desde:', require.resolve('./routes/articulos'));

// API routes
app.use('/articulos', articulosRouter);
app.use('/depositos', depositosRouter);
app.use('/stock', stockRouter);
app.use('/transferencias', transferenciasRouter);
app.use('/movimientos', movimientosRouter);
app.use('/produccion', produccionRouter);
app.use('/ajustes', ajustesRouter);
app.use('/fabrica', fabricaRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/admin', adminRouter);
app.use('/utilidades', utilidadesRouter);
app.use('/articulos', articuloClasifRouter);
app.use('/clasificaciones', clasificacionesRouter);
app.use('/remitos', remitosRouter);
app.use('/remito-proveedores', remitoProveedoresRouter);

// Debug
app.get('/__routes', (_req, res) => {
  res.json(listEndpoints(app));
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Servir frontend compilado
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// Catch-all para que React Router maneje /, /login, etc.
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
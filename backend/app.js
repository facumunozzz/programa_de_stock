const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const listEndpoints = require('express-list-endpoints');
console.log('[APP] usando articulosRouter desde:', require.resolve('./routes/articulos'));

const articulosRouter = require('./routes/articulos');
const depositosRouter = require('./routes/depositos');
const stockRouter = require('./routes/stock');
const transferenciasRouter = require('./routes/transferencias');
const kardexRouter = require('./routes/kardex');
const movimientosRouter = require('./routes/movimientos');
const produccionRouter = require('./routes/produccion');
const ajustesRouter = require('./routes/ajustes');
app.use('/articulos', articulosRouter);
app.use('/depositos', depositosRouter);
app.use('/stock', stockRouter);
app.use('/transferencias', transferenciasRouter);
app.use('/kardex', kardexRouter);
app.use('/movimientos', movimientosRouter);
app.use('/produccion', produccionRouter);
app.use('/ajustes', ajustesRouter);

// Endpoint para listar rutas instaladas (borrar luego)
app.get('/__routes', (req, res) => {
  res.json(listEndpoints(app));
});

// Bypass directo (sin pasar por el router) para aislar si el 404 es del router
app.get('/articulos/codigo/direct/:cod?', (req, res) => {
  res.json({ direct: true, cod: req.params.cod ?? null });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

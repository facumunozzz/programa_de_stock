require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const listEndpoints = require("express-list-endpoints");

const app = express();

app.use(cors());
app.use(express.json());

const articulosRouter = require("./routes/articulos");
const depositosRouter = require("./routes/depositos");
const stockRouter = require("./routes/stock");
const transferenciasRouter = require("./routes/transferencias");
const movimientosRouter = require("./routes/movimientos");
const produccionRouter = require("./routes/produccion");
const ajustesRouter = require("./routes/ajustes");
const fabricaRouter = require("./routes/fabrica");
const adminRouter = require("./routes/administracion");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users.js");
const utilidadesRouter = require("./routes/utilidades");
const articuloClasifRouter = require("./routes/articuloClasificaciones");
const clasificacionesRouter = require("./routes/clasificaciones");
const remitosRouter = require("./routes/remitos");
const remitoProveedoresRouter = require("./routes/remitoProveedores");
const recuentoCiclicoRouter = require("./routes/recuentoCiclico");

console.log("[APP] usando articulosRouter desde:", require.resolve("./routes/articulos"));

app.use("/api/articulos", articulosRouter);
app.use("/api/depositos", depositosRouter);
app.use("/api/stock", stockRouter);
app.use("/api/transferencias", transferenciasRouter);
app.use("/api/movimientos", movimientosRouter);
app.use("/api/produccion", produccionRouter);
app.use("/api/ajustes", ajustesRouter);
app.use("/api/fabrica", fabricaRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/utilidades", utilidadesRouter);
app.use("/api/articulos", articuloClasifRouter);
app.use("/api/clasificaciones", clasificacionesRouter);
app.use("/api/remitos", remitosRouter);
app.use("/api/remito-proveedores", remitoProveedoresRouter);
app.use("/api/recuento-ciclico", recuentoCiclicoRouter);

app.get("/__routes", (_req, res) => {
  res.json(listEndpoints(app));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const frontendPath = path.join(__dirname, "../frontend/dist");

app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
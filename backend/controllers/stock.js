// backend/controllers/stock.js
const { sql, poolConnect, getPool } = require("../db");

const norm = (v) => String(v ?? "").trim().toUpperCase();

// =====================================================
// GET /stock
// Lista stock para el frontend Stock.jsx
// =====================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        s.id_stock,
        s.id_articulo,
        a.cod_articulo,
        a.descripcion,
        a.cod_modelo,
        a.color,
        a.talle,
        a.cod_barra,
        a.tipo,
        a.familia,
        a.subfamilia,
        a.material,
        a.iibb_aplica,
        a.lista_precios_aplica,
        s.id_deposito,
        ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
        ISNULL(s.cantidad, 0) AS cantidad,
        ISNULL(s.asignado, 0) AS asignado,
        ISNULL(s.disponible, 0) AS disponible
      FROM dbo.stock s WITH (NOLOCK)
      INNER JOIN dbo.articulos a WITH (NOLOCK)
        ON a.id_articulo = s.id_articulo
      LEFT JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito = s.id_deposito
      ORDER BY a.cod_articulo, d.nombre;
    `);

    res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.getAll:", err);
    res.status(500).json({
      error: "Error al obtener stock",
      detalle: err.message,
    });
  }
};

// Alias por si tus rutas usan otro nombre
exports.obtenerStock = exports.getAll;
exports.getStock = exports.getAll;

// =====================================================
// GET /stock/resumen
// Agrupa stock total por artículo
// =====================================================
exports.getResumen = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        a.id_articulo,
        a.cod_articulo,
        a.descripcion,
        a.cod_modelo,
        a.color,
        a.talle,
        a.cod_barra,
        a.tipo,
        a.familia,
        a.subfamilia,
        a.material,
        a.iibb_aplica,
        a.lista_precios_aplica,
        SUM(ISNULL(s.cantidad, 0)) AS cantidad,
        SUM(ISNULL(s.asignado, 0)) AS asignado,
        SUM(ISNULL(s.disponible, 0)) AS disponible
      FROM dbo.articulos a WITH (NOLOCK)
      LEFT JOIN dbo.stock s WITH (NOLOCK)
        ON s.id_articulo = a.id_articulo
      GROUP BY
        a.id_articulo,
        a.cod_articulo,
        a.descripcion,
        a.cod_modelo,
        a.color,
        a.talle,
        a.cod_barra,
        a.tipo,
        a.familia,
        a.subfamilia,
        a.material,
        a.iibb_aplica,
        a.lista_precios_aplica
      ORDER BY a.cod_articulo;
    `);

    res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.getResumen:", err);
    res.status(500).json({
      error: "Error al obtener resumen de stock",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock/detalle?codigo=XXX
// Detalle de stock por código de artículo
// =====================================================
exports.getDetalle = async (req, res) => {
  const codigo = norm(req.query.codigo);

  if (!codigo) {
    return res.status(400).json({
      error: "Debe indicar ?codigo=...",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.VarChar(80), codigo)
      .query(`
        SELECT
          s.id_stock,
          s.id_articulo,
          a.cod_articulo,
          a.descripcion,
          a.cod_modelo,
          a.color,
          a.talle,
          a.cod_barra,
          a.tipo,
          a.familia,
          a.subfamilia,
          a.material,
          a.iibb_aplica,
          a.lista_precios_aplica,
          s.id_deposito,
          ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
          ISNULL(s.cantidad, 0) AS cantidad,
          ISNULL(s.asignado, 0) AS asignado,
          ISNULL(s.disponible, 0) AS disponible
        FROM dbo.stock s WITH (NOLOCK)
        INNER JOIN dbo.articulos a WITH (NOLOCK)
          ON a.id_articulo = s.id_articulo
        LEFT JOIN dbo.depositos d WITH (NOLOCK)
          ON d.id_deposito = s.id_deposito
        WHERE UPPER(LTRIM(RTRIM(a.cod_articulo))) = @codigo
        ORDER BY d.nombre;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Artículo sin stock o no encontrado",
        codigo,
      });
    }

    res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.getDetalle:", err);
    res.status(500).json({
      error: "Error al obtener detalle de stock",
      detalle: err.message,
    });
  }
};

// Alias por si tus rutas usan otro nombre
exports.obtenerDetalleStock = exports.getDetalle;
exports.getStockDetalle = exports.getDetalle;

// =====================================================
// GET /stock/articulo/:id_articulo
// Stock por ID de artículo
// =====================================================
exports.getByArticuloId = async (req, res) => {
  const idArticulo = Number(req.params.id_articulo || req.params.id);

  if (!Number.isInteger(idArticulo)) {
    return res.status(400).json({
      error: "ID de artículo inválido",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idArticulo", sql.Int, idArticulo)
      .query(`
        SELECT
          s.id_stock,
          s.id_articulo,
          a.cod_articulo,
          a.descripcion,
          s.id_deposito,
          ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
          ISNULL(s.cantidad, 0) AS cantidad,
          ISNULL(s.asignado, 0) AS asignado,
          ISNULL(s.disponible, 0) AS disponible
        FROM dbo.stock s WITH (NOLOCK)
        INNER JOIN dbo.articulos a WITH (NOLOCK)
          ON a.id_articulo = s.id_articulo
        LEFT JOIN dbo.depositos d WITH (NOLOCK)
          ON d.id_deposito = s.id_deposito
        WHERE s.id_articulo = @idArticulo
        ORDER BY d.nombre;
      `);

    res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.getByArticuloId:", err);
    res.status(500).json({
      error: "Error al obtener stock por artículo",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock/deposito/:id_deposito
// Stock por depósito
// =====================================================
exports.getByDepositoId = async (req, res) => {
  const idDeposito = Number(req.params.id_deposito || req.params.id);

  if (!Number.isInteger(idDeposito)) {
    return res.status(400).json({
      error: "ID de depósito inválido",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idDeposito", sql.Int, idDeposito)
      .query(`
        SELECT
          s.id_stock,
          s.id_articulo,
          a.cod_articulo,
          a.descripcion,
          a.cod_modelo,
          a.color,
          a.talle,
          a.cod_barra,
          a.tipo,
          a.familia,
          a.subfamilia,
          a.material,
          a.iibb_aplica,
          a.lista_precios_aplica,
          s.id_deposito,
          ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
          ISNULL(s.cantidad, 0) AS cantidad,
          ISNULL(s.asignado, 0) AS asignado,
          ISNULL(s.disponible, 0) AS disponible
        FROM dbo.stock s WITH (NOLOCK)
        INNER JOIN dbo.articulos a WITH (NOLOCK)
          ON a.id_articulo = s.id_articulo
        LEFT JOIN dbo.depositos d WITH (NOLOCK)
          ON d.id_deposito = s.id_deposito
        WHERE s.id_deposito = @idDeposito
        ORDER BY a.cod_articulo;
      `);

    res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.getByDepositoId:", err);
    res.status(500).json({
      error: "Error al obtener stock por depósito",
      detalle: err.message,
    });
  }
};

// =====================================================
// POST /stock
// Crear o actualizar stock de un artículo en un depósito
// Body esperado:
// {
//   "id_articulo": 1,
//   "id_deposito": 1,
//   "cantidad": 10,
//   "asignado": 0
// }
// =====================================================
exports.upsertStock = async (req, res) => {
  try {
    const idArticulo = Number(req.body?.id_articulo);
    const idDeposito = Number(req.body?.id_deposito);
    const cantidad = Number(req.body?.cantidad ?? 0);
    const asignado = Number(req.body?.asignado ?? 0);
    const disponible = cantidad - asignado;

    if (!Number.isInteger(idArticulo)) {
      return res.status(400).json({ error: "id_articulo inválido" });
    }

    if (!Number.isInteger(idDeposito)) {
      return res.status(400).json({ error: "id_deposito inválido" });
    }

    if (Number.isNaN(cantidad)) {
      return res.status(400).json({ error: "cantidad inválida" });
    }

    if (Number.isNaN(asignado)) {
      return res.status(400).json({ error: "asignado inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id_articulo", sql.Int, idArticulo)
      .input("id_deposito", sql.Int, idDeposito)
      .input("cantidad", sql.Decimal(18, 2), cantidad)
      .input("asignado", sql.Decimal(18, 2), asignado)
      .input("disponible", sql.Decimal(18, 2), disponible)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.stock
          WHERE id_articulo = @id_articulo
            AND id_deposito = @id_deposito
        )
        BEGIN
          UPDATE dbo.stock
             SET cantidad = @cantidad,
                 asignado = @asignado,
                 disponible = @disponible
           WHERE id_articulo = @id_articulo
             AND id_deposito = @id_deposito;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.stock (
            id_articulo,
            id_deposito,
            cantidad,
            asignado,
            disponible
          )
          VALUES (
            @id_articulo,
            @id_deposito,
            @cantidad,
            @asignado,
            @disponible
          );
        END

        SELECT
          s.id_stock,
          s.id_articulo,
          a.cod_articulo,
          a.descripcion,
          s.id_deposito,
          ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
          ISNULL(s.cantidad, 0) AS cantidad,
          ISNULL(s.asignado, 0) AS asignado,
          ISNULL(s.disponible, 0) AS disponible
        FROM dbo.stock s
        INNER JOIN dbo.articulos a
          ON a.id_articulo = s.id_articulo
        LEFT JOIN dbo.depositos d
          ON d.id_deposito = s.id_deposito
        WHERE s.id_articulo = @id_articulo
          AND s.id_deposito = @id_deposito;
      `);

    res.json({
      message: "Stock actualizado correctamente",
      stock: result.recordset?.[0] || null,
    });
  } catch (err) {
    console.error("Error en stock.upsertStock:", err);
    res.status(500).json({
      error: "Error al guardar stock",
      detalle: err.message,
    });
  }
};

// Alias por si tus rutas usan otro nombre
exports.createOrUpdateStock = exports.upsertStock;
exports.guardarStock = exports.upsertStock;

// =====================================================
// PUT /stock/:id_stock
// Actualizar cantidad/asignado por id_stock
// Body:
// {
//   "cantidad": 10,
//   "asignado": 2
// }
// =====================================================
exports.updateStock = async (req, res) => {
  try {
    const idStock = Number(req.params.id_stock || req.params.id);
    const cantidad = Number(req.body?.cantidad ?? 0);
    const asignado = Number(req.body?.asignado ?? 0);
    const disponible = cantidad - asignado;

    if (!Number.isInteger(idStock)) {
      return res.status(400).json({ error: "id_stock inválido" });
    }

    if (Number.isNaN(cantidad)) {
      return res.status(400).json({ error: "cantidad inválida" });
    }

    if (Number.isNaN(asignado)) {
      return res.status(400).json({ error: "asignado inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id_stock", sql.Int, idStock)
      .input("cantidad", sql.Decimal(18, 2), cantidad)
      .input("asignado", sql.Decimal(18, 2), asignado)
      .input("disponible", sql.Decimal(18, 2), disponible)
      .query(`
        UPDATE dbo.stock
           SET cantidad = @cantidad,
               asignado = @asignado,
               disponible = @disponible
         WHERE id_stock = @id_stock;

        SELECT
          s.id_stock,
          s.id_articulo,
          a.cod_articulo,
          a.descripcion,
          s.id_deposito,
          ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
          ISNULL(s.cantidad, 0) AS cantidad,
          ISNULL(s.asignado, 0) AS asignado,
          ISNULL(s.disponible, 0) AS disponible
        FROM dbo.stock s
        INNER JOIN dbo.articulos a
          ON a.id_articulo = s.id_articulo
        LEFT JOIN dbo.depositos d
          ON d.id_deposito = s.id_deposito
        WHERE s.id_stock = @id_stock;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Registro de stock no encontrado",
      });
    }

    res.json({
      message: "Stock actualizado correctamente",
      stock: result.recordset[0],
    });
  } catch (err) {
    console.error("Error en stock.updateStock:", err);
    res.status(500).json({
      error: "Error al actualizar stock",
      detalle: err.message,
    });
  }
};

// =====================================================
// DELETE /stock/:id_stock
// Eliminar registro de stock
// =====================================================
exports.deleteStock = async (req, res) => {
  try {
    const idStock = Number(req.params.id_stock || req.params.id);

    if (!Number.isInteger(idStock)) {
      return res.status(400).json({
        error: "id_stock inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id_stock", sql.Int, idStock)
      .query(`
        DELETE FROM dbo.stock
        WHERE id_stock = @id_stock;
      `);

    if (result.rowsAffected?.[0] === 0) {
      return res.status(404).json({
        error: "Registro de stock no encontrado",
      });
    }

    res.json({
      message: "Stock eliminado correctamente",
    });
  } catch (err) {
    console.error("Error en stock.deleteStock:", err);
    res.status(500).json({
      error: "Error al eliminar stock",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock/buscar?codigo=XXX
// Buscar stock por cod_articulo o cod_barra
// =====================================================
exports.buscarStock = async (req, res) => {
  const codigo = norm(req.query.codigo || req.query.q || req.params.codigo);

  if (!codigo) {
    return res.status(400).json({
      error: "Debe indicar código",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.VarChar(80), codigo)
      .query(`
        SELECT
          s.id_stock,
          s.id_articulo,
          a.cod_articulo,
          a.descripcion,
          a.cod_modelo,
          a.color,
          a.talle,
          a.cod_barra,
          a.tipo,
          a.familia,
          a.subfamilia,
          a.material,
          a.iibb_aplica,
          a.lista_precios_aplica,
          s.id_deposito,
          ISNULL(d.nombre, 'SIN DEPÓSITO') AS deposito,
          ISNULL(s.cantidad, 0) AS cantidad,
          ISNULL(s.asignado, 0) AS asignado,
          ISNULL(s.disponible, 0) AS disponible
        FROM dbo.stock s WITH (NOLOCK)
        INNER JOIN dbo.articulos a WITH (NOLOCK)
          ON a.id_articulo = s.id_articulo
        LEFT JOIN dbo.depositos d WITH (NOLOCK)
          ON d.id_deposito = s.id_deposito
        WHERE UPPER(LTRIM(RTRIM(a.cod_articulo))) = @codigo
           OR UPPER(LTRIM(RTRIM(a.cod_barra))) = @codigo
        ORDER BY d.nombre;
      `);

    res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.buscarStock:", err);
    res.status(500).json({
      error: "Error al buscar stock",
      detalle: err.message,
    });
  }
};
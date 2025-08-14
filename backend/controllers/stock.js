// controllers/stock.js
const { sql, poolConnect, getPool } = require('../db');

// Normaliza strings vacíos a NULL
const toDb = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/**
 * GET /stock
 * Lista el stock con artículo y depósito.
 * Soporta filtro opcional ?cod_articulo=ABC (case/espacios insensible)
 */
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const cod = toDb(req.query.cod_articulo)?.toUpperCase();

    let query = `
      SELECT
        a.cod_articulo,
        a.descripcion,
        s.cantidad,
        d.nombre AS deposito
      FROM stock s
      JOIN articulos a ON a.id_articulo = s.id_articulo
      JOIN depositos d ON d.id_deposito = s.id_deposito
    `;

    const reqDb = pool.request();

    if (cod) {
      query += ` WHERE UPPER(LTRIM(RTRIM(a.cod_articulo))) = @cod `;
      reqDb.input('cod', sql.VarChar, cod);
    }

    query += ` ORDER BY a.cod_articulo, d.nombre`;

    const result = await reqDb.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error en stock.getAll:', err);
    res.status(500).json({ error: 'Error al obtener stock', detalle: err.message });
  }
};

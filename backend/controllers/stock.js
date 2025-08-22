// controllers/stock.js
const { sql, poolConnect, getPool } = require('../db');

// Normaliza strings vacíos a NULL
const toDb = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/**
 * GET /stock
 * Lista el stock con artículo y depósito.
 * Filtros opcionales:
 *   - ?cod_articulo=ABC        (match exacto)
 *   - ?q=abc                   (contiene en código, descripción o depósito)
 */
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const cod = toDb(req.query.cod_articulo)?.toUpperCase();
    const q   = toDb(req.query.q)?.toUpperCase();

    // Base con SUM por si hubiera múltiples movimientos/filas por (artículo, depósito)
    let query = `
    SELECT
      a.id_articulo,
      a.cod_articulo,
      ISNULL(a.descripcion,'')       AS descripcion,
      ISNULL(a.cod_modelo,'')        AS cod_modelo,
      ISNULL(a.color,'')             AS color,
      ISNULL(a.talle,'')             AS talle,
      ISNULL(a.cod_barra,'')         AS cod_barra,
      ISNULL(a.tipo,'')              AS tipo,
      ISNULL(a.familia,'')           AS familia,
      ISNULL(a.subfamilia,'')        AS subfamilia,
      ISNULL(a.material,'')          AS material,
      ISNULL(a.iibb_aplica,'')       AS iibb_aplica,
      ISNULL(a.lista_precios_aplica,'') AS lista_precios_aplica,
      ISNULL(SUM(s.cantidad), 0)     AS cantidad,
      d.nombre                       AS deposito
    FROM stock s
    JOIN articulos a ON a.id_articulo = s.id_articulo
    JOIN depositos d ON d.id_deposito = s.id_deposito
    `;

    const reqDb = pool.request();
    const where = [];

    if (cod) {
      where.push(`UPPER(LTRIM(RTRIM(a.cod_articulo))) = @cod`);
      reqDb.input('cod', sql.VarChar, cod);
    }

    if (q) {
      where.push(`(
          UPPER(a.cod_articulo) LIKE '%' + @q + '%'
       OR UPPER(a.descripcion)  LIKE '%' + @q + '%'
       OR UPPER(d.nombre)       LIKE '%' + @q + '%'
      )`);
      reqDb.input('q', sql.VarChar, q);
    }

    if (where.length) {
      query += ` WHERE ` + where.join(' AND ');
    }

    query += `
      GROUP BY
        a.id_articulo, a.cod_articulo, a.descripcion, a.cod_modelo, a.color, a.talle,
        a.cod_barra, a.tipo, a.familia, a.subfamilia, a.material, a.iibb_aplica,
        a.lista_precios_aplica, d.nombre
      ORDER BY a.cod_articulo, d.nombre
    `;

    const result = await reqDb.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error en stock.getAll:', err);
    res.status(500).json({ error: 'Error al obtener stock', detalle: err.message });
  }
};


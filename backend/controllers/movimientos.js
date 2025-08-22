// controllers/movimientos.js
const { sql, poolConnect, getPool } = require('../db');

function q(s) { return s.replace(/'/g, "''"); } // por si acaso en literales

// Devuelve el primer nombre que exista entre las opciones
async function pickExistingTable(pool, candidates = []) {
  if (!candidates.length) return null;
  const inList = candidates.map(n => `'${q(n)}'`).join(',');
  const r = await pool.request().query(`
    SELECT TOP (1) name
    FROM sys.objects
    WHERE type = 'U' AND name IN (${inList})
    ORDER BY name
  `);
  return r.recordset[0]?.name || null;
}

/**
 * GET /movimientos
 * Devuelve filas normalizadas:
 *  fecha, codigo, descripcion, cantidad, deposito, usuario, movimiento, num_movimiento
 */
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    // ¿Qué tabla de detalles de AJUSTE existe?
    const ajusteDetalleTable = await pickExistingTable(pool, [
      'ajuste_detalles',
      'ajustes_detalles'
    ]);

    // ¿Qué tabla de detalles de TRANSFERENCIA existe?
    const transfDetalleTable = await pickExistingTable(pool, [
      'transferencia_detalles',
      'transferencias_detalle',      // por si alguien la creó así
      'transferencias_detalles'      // otro posible plural
    ]);

    // Armamos SELECTs que mapean a mismas columnas
    const selects = [];

    // --- TRANSFERENCIAS: salida (origen, cantidad negativa)
    if (transfDetalleTable) {
      selects.push(`
        SELECT
          t.fecha                                    AS fecha,
          td.cod_articulo                            AS codigo,
          td.descripcion                              AS descripcion,
          -1 * CAST(td.cantidad AS INT)              AS cantidad,       -- negativo en origen
          t.origen                                   AS deposito,
          CAST(NULL AS VARCHAR(50))                  AS usuario,
          'TRANSFERENCIA'                            AS movimiento,
          t.numero_transferencia                     AS num_movimiento
        FROM transferencias t
        JOIN ${transfDetalleTable} td
          ON td.transferencia_id = t.numero_transferencia
      `);

      // --- TRANSFERENCIAS: entrada (destino, cantidad positiva)
      selects.push(`
        SELECT
          t.fecha                                    AS fecha,
          td.cod_articulo                            AS codigo,
          td.descripcion                              AS descripcion,
          CAST(td.cantidad AS INT)                   AS cantidad,       -- positivo en destino
          t.destino                                  AS deposito,
          CAST(NULL AS VARCHAR(50))                  AS usuario,
          'TRANSFERENCIA'                            AS movimiento,
          t.numero_transferencia                     AS num_movimiento
        FROM transferencias t
        JOIN ${transfDetalleTable} td
          ON td.transferencia_id = t.numero_transferencia
      `);
    }

    // --- AJUSTES (si existen tablas)
    const ajustesTable = await pickExistingTable(pool, ['ajustes']);
    if (ajustesTable && ajusteDetalleTable) {
      selects.push(`
        SELECT
          a.fecha                                    AS fecha,
          ad.cod_articulo                            AS codigo,
          ad.descripcion                              AS descripcion,
          CAST(ad.cantidad AS INT)                   AS cantidad,       -- puede ser +/- según registraste
          a.deposito                                 AS deposito,
          CAST(NULL AS VARCHAR(50))                  AS usuario,
          'AJUSTE'                                   AS movimiento,
          a.numero_ajuste                            AS num_movimiento
        FROM ${ajustesTable} a
        JOIN ${ajusteDetalleTable} ad
          ON ad.ajuste_id = a.numero_ajuste
      `);
    }

    if (selects.length === 0) {
      return res.json([]); // nada existente aún => lista vacía
    }

    const unionSql = selects.join('\nUNION ALL\n') + `\nORDER BY fecha DESC, num_movimiento DESC, codigo`;
    const r = await pool.request().query(unionSql);
    res.json(r.recordset);
  } catch (err) {
    console.error('movimientos.getAll:', err);
    res.status(500).json({ error: 'Error al obtener movimientos', detalle: err.message });
  }
};

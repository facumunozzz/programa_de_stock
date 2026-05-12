// controllers/movimientos.js
const { sql, poolConnect, getPool } = require("../db");

function q(s) {
  return String(s || "").replace(/'/g, "''");
}

async function pickExistingTable(pool, candidates = []) {
  if (!candidates.length) return null;

  const inList = candidates.map((n) => `'${q(n)}'`).join(",");

  const r = await pool.request().query(`
    SELECT TOP (1) name
    FROM sys.objects
    WHERE type = 'U'
      AND name IN (${inList})
    ORDER BY name
  `);

  return r.recordset[0]?.name || null;
}

/**
 * GET /movimientos
 *
 * Devuelve:
 * fecha,
 * codigo,
 * descripcion,
 * cantidad,
 * deposito,
 * usuario,
 * movimiento,
 * num_movimiento
 */
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const ajusteDetalleTable = await pickExistingTable(pool, [
      "ajuste_detalles",
      "ajustes_detalles",
    ]);

    const transfDetalleTable = await pickExistingTable(pool, [
      "transferencia_detalles",
      "transferencias_detalle",
      "transferencias_detalles",
    ]);

    const remitosTable = await pickExistingTable(pool, ["remitos"]);
    const remitoDetalleTable = await pickExistingTable(pool, [
      "remito_detalles",
      "remitos_detalles",
    ]);

    const ajustesTable = await pickExistingTable(pool, ["ajustes"]);

    const selects = [];

    // ======================================================
    // TRANSFERENCIAS - SALIDA
    // ======================================================
    if (transfDetalleTable) {
      selects.push(`
        SELECT
          t.fecha                                      AS fecha,
          td.cod_articulo                              AS codigo,
          td.descripcion                               AS descripcion,
          -1 * CAST(td.cantidad AS DECIMAL(18, 2))     AS cantidad,
          t.origen                                     AS deposito,
          COALESCE(u.nombre, u.username, u.email, '')  AS usuario,
          'TRANSFERENCIA SALIDA'                       AS movimiento,
          CAST(t.numero_transferencia AS VARCHAR(50))  AS num_movimiento
        FROM dbo.transferencias t
        JOIN dbo.${transfDetalleTable} td
          ON td.transferencia_id = t.numero_transferencia
        LEFT JOIN dbo.usuarios u
          ON u.id_usuario = t.id_usuario
      `);

      // ======================================================
      // TRANSFERENCIAS - ENTRADA
      // ======================================================
      selects.push(`
        SELECT
          t.fecha                                      AS fecha,
          td.cod_articulo                              AS codigo,
          td.descripcion                               AS descripcion,
          CAST(td.cantidad AS DECIMAL(18, 2))          AS cantidad,
          t.destino                                    AS deposito,
          COALESCE(u.nombre, u.username, u.email, '')  AS usuario,
          'TRANSFERENCIA ENTRADA'                      AS movimiento,
          CAST(t.numero_transferencia AS VARCHAR(50))  AS num_movimiento
        FROM dbo.transferencias t
        JOIN dbo.${transfDetalleTable} td
          ON td.transferencia_id = t.numero_transferencia
        LEFT JOIN dbo.usuarios u
          ON u.id_usuario = t.id_usuario
      `);
    }

    // ======================================================
    // AJUSTES
    // ======================================================
    if (ajustesTable && ajusteDetalleTable) {
      selects.push(`
        SELECT
          a.fecha                                      AS fecha,
          ad.cod_articulo                              AS codigo,
          ad.descripcion                               AS descripcion,
          CAST(ad.cantidad AS DECIMAL(18, 2))          AS cantidad,
          a.deposito                                   AS deposito,
          COALESCE(u.nombre, u.username, u.email, '')  AS usuario,
          'AJUSTE'                                     AS movimiento,
          CAST(a.numero_ajuste AS VARCHAR(50))         AS num_movimiento
        FROM dbo.${ajustesTable} a
        JOIN dbo.${ajusteDetalleTable} ad
          ON ad.ajuste_id = a.numero_ajuste
        LEFT JOIN dbo.usuarios u
          ON u.id_usuario = a.id_usuario
      `);
    }

    // ======================================================
    // REMITOS
    // INGRESO = positivo
    // EGRESO  = negativo
    // ======================================================
    if (remitosTable && remitoDetalleTable) {
      selects.push(`
        SELECT
          r.fecha                                      AS fecha,
          rd.codigo                                    AS codigo,
          rd.descripcion                               AS descripcion,
          CASE
            WHEN UPPER(LTRIM(RTRIM(r.tipo))) = 'EGRESO'
              THEN -1 * CAST(rd.cantidad AS DECIMAL(18, 2))
            ELSE CAST(rd.cantidad AS DECIMAL(18, 2))
          END                                          AS cantidad,
          COALESCE(d.nombre, '')                       AS deposito,
          ISNULL(r.usuario, '')                        AS usuario,
          CASE
            WHEN UPPER(LTRIM(RTRIM(r.tipo))) = 'EGRESO'
              THEN 'REMITO EGRESO'
            ELSE 'REMITO INGRESO'
          END                                          AS movimiento,
          CAST(r.nro_remito AS VARCHAR(50))            AS num_movimiento
        FROM dbo.${remitosTable} r
        JOIN dbo.${remitoDetalleTable} rd
          ON rd.id_remito = r.id_remito
        LEFT JOIN dbo.depositos d
          ON d.id_deposito = rd.deposito_id
      `);
    }

    // ======================================================
    // PRODUCCIÓN - CONSUMO DE MATERIALES
    // ======================================================
    selects.push(`
      SELECT
        o.fecha                                      AS fecha,
        am.cod_articulo                              AS codigo,
        am.descripcion                               AS descripcion,
        -1 * CAST(od.cantidad AS DECIMAL(18, 2))     AS cantidad,
        d1.nombre                                    AS deposito,
        COALESCE(u.nombre, u.username, u.email, '')  AS usuario,
        'PRODUCCION CONSUMO'                         AS movimiento,
        CAST(o.numero_orden AS VARCHAR(50))          AS num_movimiento
      FROM dbo.produccion_orden_detalles od
      JOIN dbo.produccion_ordenes o
        ON o.id = od.orden_id
      JOIN dbo.articulos am
        ON am.id_articulo = od.material_id
      JOIN dbo.depositos d1
        ON d1.id_deposito = o.deposito_origen_id
      LEFT JOIN dbo.usuarios u
        ON u.id_usuario = o.id_usuario
    `);

    // ======================================================
    // PRODUCCIÓN - ALTA PRODUCTO TERMINADO
    // ======================================================
    selects.push(`
      SELECT
        o.fecha                                      AS fecha,
        ap.cod_articulo                              AS codigo,
        ap.descripcion                               AS descripcion,
        CAST(o.cantidad AS DECIMAL(18, 2))           AS cantidad,
        d2.nombre                                    AS deposito,
        COALESCE(u.nombre, u.username, u.email, '')  AS usuario,
        'PRODUCCION ALTA'                            AS movimiento,
        CAST(o.numero_orden AS VARCHAR(50))          AS num_movimiento
      FROM dbo.produccion_ordenes o
      JOIN dbo.articulos ap
        ON ap.id_articulo = o.producto_id
      JOIN dbo.depositos d2
        ON d2.id_deposito = o.deposito_destino_id
      LEFT JOIN dbo.usuarios u
        ON u.id_usuario = o.id_usuario
    `);

    if (!selects.length) {
      return res.json([]);
    }

    const unionSql =
      selects.join("\nUNION ALL\n") +
      `
      ORDER BY fecha DESC, num_movimiento DESC, codigo
      `;

    const r = await pool.request().query(unionSql);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("movimientos.getAll:", err);

    res.status(500).json({
      error: "Error al obtener movimientos",
      detalle: err.message,
    });
  }
};
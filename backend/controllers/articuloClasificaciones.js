const { sql, poolConnect, getPool } = require('../db');

// 🔹 Obtener todas las clasificaciones activas (para formularios)
exports.getActiveClasificaciones = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const rs = await pool.request().query(`
      SELECT id_clasificacion, nombre, es_obligatoria
      FROM clasificaciones
      WHERE activa = 1
      ORDER BY nombre
    `);
    res.json(rs.recordset);
  } catch (err) {
    console.error('getActiveClasificaciones:', err);
    res.status(500).json({ error: 'Error al obtener clasificaciones activas' });
  }
};

// 🔹 Obtener clasificaciones y valores actuales de un artículo
exports.getClasificacionesPorArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de artículo inválido' });

    await poolConnect;
    const pool = await getPool();

    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT c.id_clasificacion, c.nombre, c.es_obligatoria,
               ISNULL(ac.valor, '') AS valor
        FROM clasificaciones c
        LEFT JOIN articulo_clasificacion ac
          ON ac.id_clasificacion = c.id_clasificacion
          AND ac.id_articulo = @id
        WHERE c.activa = 1
        ORDER BY c.nombre
      `);

    res.json(rs.recordset);
  } catch (err) {
    console.error('getClasificacionesPorArticulo:', err);
    res.status(500).json({ error: 'Error al obtener clasificaciones del artículo' });
  }
};

// 🔹 Guardar / actualizar valores de clasificaciones por artículo
exports.saveClasificacionesPorArticulo = async (req, res) => {
  let trans;
  try {
    const id = Number(req.params.id);
    const valores = req.body?.clasificaciones; // [{ id_clasificacion, valor }]
    if (!id || !Array.isArray(valores)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    // Borrar anteriores
    const rqDel = new sql.Request(trans);
    await rqDel.input('id', sql.Int, id)
      .query(`DELETE FROM articulo_clasificacion WHERE id_articulo = @id`);

    // Insertar nuevos valores
    for (const v of valores) {
      const rqIns = new sql.Request(trans);
      rqIns
        .input('id', sql.Int, id)
        .input('cid', sql.Int, v.id_clasificacion)
        .input('val', sql.VarChar, v.valor || null);
      await rqIns.query(`
        INSERT INTO articulo_clasificacion (id_articulo, id_clasificacion, valor)
        VALUES (@id, @cid, @val)
      `);
    }

    await trans.commit();
    res.json({ ok: true, message: 'Clasificaciones guardadas' });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('saveClasificacionesPorArticulo:', err);
    res.status(500).json({ error: 'Error al guardar clasificaciones' });
  }
};

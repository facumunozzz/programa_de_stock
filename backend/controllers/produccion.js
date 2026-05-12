// controllers/produccion.js
const { sql, poolConnect, getPool } = require('../db');

const toDb = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up   = (v) => (toDb(v)?.toUpperCase() ?? null);

/**
 * POST /produccion/formulas
 * Body:
 *   {
 *     "codigo": "PROD001",
 *     "items": [
 *       {"cod_articulo":"MAT001","cantidad": 2},
 *       {"cod_articulo":"MAT002","cantidad": 5}
 *     ]
 *   }
 * Crea la fórmula del producto (si no existe aún).
 */
exports.createFormula = async (req, res) => {
  const codigoProducto = up(req.body?.codigo);
  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!codigoProducto) {
    return res.status(400).json({ error: 'Debe indicar el CÓDIGO del producto' });
  }
  if (!itemsRaw.length) {
    return res.status(400).json({ error: 'Debe incluir al menos un MATERIAL en items' });
  }

  // Normalizar items: cod en mayúscula, cantidad > 0
  const items = itemsRaw
    .map(it => ({ cod: up(it.cod_articulo), cant: Number(it.cantidad) || 0 }))
    .filter(it => it.cod && it.cant > 0);

  if (!items.length) {
    return res.status(400).json({ error: 'Items inválidos: códigos/cantidades' });
  }

  // Merge duplicados por código (suma cantidades)
  const agg = new Map();
  for (const it of items) {
    agg.set(it.cod, (agg.get(it.cod) || 0) + it.cant);
  }
  const itemsMerged = Array.from(agg.entries()).map(([cod, cant]) => ({ cod, cant }));

  // Evitar auto-referencia (material = producto)
  if (itemsMerged.some(it => it.cod === codigoProducto)) {
    return res.status(400).json({ error: 'El producto no puede ser material de su propia fórmula' });
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // 1) Validar producto existe
    const prod = await rq
      .input('c', sql.VarChar, codigoProducto)
      .query(`
        SELECT id_articulo, cod_articulo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
      `);

    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'El código de PRODUCTO no existe' });
    }
    const producto = prod.recordset[0];
    const productoId = producto.id_articulo;

    // 2) Chequear si ya existe fórmula para este producto
    const ya = await rq
      .input('pid', sql.Int, productoId)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (ya.recordset.length) {
      await trans.rollback();
      return res.status(409).json({ error: 'Ya existe una fórmula para este producto' });
    }

    // 3) Validar que todos los materiales existan
    const inList = itemsMerged.map((_, i) => `@m${i}`).join(',');
    itemsMerged.forEach((it, i) => rq.input(`m${i}`, sql.VarChar, it.cod));
    const mats = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(cod_articulo))) AS cod, descripcion
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${inList})
    `);
    const idByCode = new Map(mats.recordset.map(r => [r.cod, r.id_articulo]));
    const descByCode = new Map(mats.recordset.map(r => [r.cod, r.descripcion]));
    const faltantes = itemsMerged.filter(it => !idByCode.has(it.cod)).map(it => it.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'Materiales inexistentes', detalle: faltantes });
    }

    // 4) Insert cabecera
    const insCab = await rq
      .input('pid2', sql.Int, productoId)
      .query(`
        INSERT INTO produccion_formulas (producto_id)
        OUTPUT INSERTED.id, INSERTED.producto_id, INSERTED.fecha_creacion
        VALUES (@pid2)
      `);
    const formulaId = insCab.recordset[0].id;

    // 5) Insert detalles (materiales)
    for (const it of itemsMerged) {
      const matId = idByCode.get(it.cod);
      await rq
        .input('fid', sql.Int, formulaId)
        .input('mid', sql.Int, matId)
        .input('qty', sql.Decimal(18, 2), it.cant)
        .query(`
          INSERT INTO produccion_formula_detalles (formula_id, material_id, cantidad)
          VALUES (@fid, @mid, @qty)
        `);
    }

    await trans.commit();

    // 6) Respuesta armada (producto + detalle)
    const detalle = itemsMerged.map(it => ({
      cod_articulo: it.cod,
      descripcion: descByCode.get(it.cod) || '',
      cantidad: it.cant
    }));

    return res.status(201).json({
      message: 'Fórmula creada correctamente',
      formula: {
        producto: {
          id_articulo: productoId,
          cod_articulo: codigoProducto,
          descripcion: producto.descripcion
        },
        detalle
      }
    });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.createFormula:', err);
    return res.status(500).json({ error: 'Error al crear la fórmula', detalle: err.message });
  }
};


/**
 * GET /produccion/formulas/:codigo
 * Devuelve la fórmula (si existe) para un código de producto.
 */
exports.getFormulaByCodigo = async (req, res) => {
  const codigo = up(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'Código inválido' });

  try {
    await poolConnect;
    const pool = await getPool();

    // Producto
    const pr = await pool.request()
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo, cod_articulo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
      `);
    if (!pr.recordset.length) return res.status(404).json({ error: 'Artículo no encontrado' });
    const prod = pr.recordset[0];

    // Fórmula cabecera
    const cab = await pool.request()
      .input('pid', sql.Int, prod.id_articulo)
      .query(`SELECT id, fecha_creacion FROM produccion_formulas WHERE producto_id = @pid`);
    if (!cab.recordset.length) {
      return res.json({ producto: prod, detalle: [], message: 'No existe fórmula para este código' });
    }
    const fid = cab.recordset[0].id;

    // Detalle con join a artículos (para código/desc de materiales)
    const det = await pool.request()
      .input('fid', sql.Int, fid)
      .query(`
        SELECT
          d.cantidad,
          a.cod_articulo,
          a.descripcion
        FROM produccion_formula_detalles d
        JOIN articulos a ON a.id_articulo = d.material_id
        WHERE d.formula_id = @fid
        ORDER BY a.cod_articulo
      `);

    res.json({
      producto: prod,
      detalle: det.recordset
    });
  } catch (err) {
    console.error('produccion.getFormulaByCodigo:', err);
    res.status(500).json({ error: 'Error al obtener la fórmula', detalle: err.message });
  }
};


/**
 * GET /produccion/formulas
 * (Opcional) Lista breve de fórmulas existentes.
 */
exports.getAllFormulas = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        f.id,
        a.cod_articulo AS codigo,
        a.descripcion,
        f.fecha_creacion
      FROM produccion_formulas f
      JOIN articulos a ON a.id_articulo = f.producto_id
      ORDER BY a.cod_articulo
    `);

    res.json(r.recordset);
  } catch (err) {
    console.error('produccion.getAllFormulas:', err);
    res.status(500).json({ error: 'Error al listar fórmulas', detalle: err.message });
  }
};


/* ========================= */
/*      NUEVAS FUNCIONES     */
/* ========================= */

/**
 * GET /produccion/check/:codigo
 * Verifica si el artículo (producto) existe. Útil para el primer paso del wizard.
 */
exports.checkProducto = async (req, res) => {
  const codigo = up(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'Código inválido' });

  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request()
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo, cod_articulo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
      `);

    if (!r.recordset.length) {
      return res.json({ exists: false });
    }
    return res.json({ exists: true, articulo: r.recordset[0] });
  } catch (err) {
    console.error('produccion.checkProducto:', err);
    res.status(500).json({ error: 'Error verificando producto', detalle: err.message });
  }
};


/**
 * POST /produccion/validar-materiales
 * Body: { codigos: ["MAT001", "MAT002", ...] }
 * Retorna { validos: [{cod, id_articulo, descripcion}], faltantes: [cod,...] }
 */
exports.validateMateriales = async (req, res) => {
  const codsRaw = Array.isArray(req.body?.codigos) ? req.body.codigos : [];
  const cods = codsRaw.map(up).filter(Boolean);

  if (!cods.length) {
    return res.status(400).json({ error: 'Debe enviar codigos[]' });
  }

  try {
    await poolConnect;
    const pool = await getPool();
    const rq = pool.request();

    const inList = cods.map((_, i) => `@c${i}`).join(',');
    cods.forEach((c, i) => rq.input(`c${i}`, sql.VarChar, c));

    const r = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(cod_articulo))) AS cod, descripcion
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${inList})
    `);

    const found = new Map(r.recordset.map(a => [a.cod, a]));
    const validos = cods.filter(c => found.has(c)).map(c => found.get(c));
    const faltantes = cods.filter(c => !found.has(c));

    res.json({ validos, faltantes });
  } catch (err) {
    console.error('produccion.validateMateriales:', err);
    res.status(500).json({ error: 'Error validando materiales', detalle: err.message });
  }
};


/**
 * PUT /produccion/formulas
 * Reemplaza la fórmula del producto (si existe) o la crea. Idempotente para edición.
 * Body: { codigo, items:[{cod_articulo, cantidad}, ...] }
 */
exports.replaceFormula = async (req, res) => {
  const codigoProducto = up(req.body?.codigo);
  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!codigoProducto) return res.status(400).json({ error: 'Debe indicar CÓDIGO de producto' });
  if (!itemsRaw.length) return res.status(400).json({ error: 'Debe incluir items' });

  const items = itemsRaw
    .map(it => ({ cod: up(it.cod_articulo), cant: Number(it.cantidad) || 0 }))
    .filter(it => it.cod && it.cant > 0);

  if (!items.length) return res.status(400).json({ error: 'Items inválidos' });
  if (items.some(it => it.cod === codigoProducto)) {
    return res.status(400).json({ error: 'El producto no puede ser material de su propia fórmula' });
  }

  // Merge duplicados
  const agg = new Map();
  for (const it of items) agg.set(it.cod, (agg.get(it.cod) || 0) + it.cant);
  const itemsMerged = Array.from(agg.entries()).map(([cod, cant]) => ({ cod, cant }));

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // Producto
    const prod = await rq
      .input('c', sql.VarChar, codigoProducto)
      .query(`
        SELECT id_articulo, cod_articulo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
      `);
    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'El código de PRODUCTO no existe' });
    }
    const producto = prod.recordset[0];
    const productoId = producto.id_articulo;

    // Validar materiales
    const inList = itemsMerged.map((_, i) => `@m${i}`).join(',');
    itemsMerged.forEach((it, i) => rq.input(`m${i}`, sql.VarChar, it.cod));
    const mats = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(cod_articulo))) AS cod, descripcion
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${inList})
    `);
    const idByCode = new Map(mats.recordset.map(r => [r.cod, r.id_articulo]));
    const faltantes = itemsMerged.filter(it => !idByCode.has(it.cod)).map(it => it.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'Materiales inexistentes', detalle: faltantes });
    }

    // Obtener (o crear) cabecera de fórmula
    const existing = await rq
      .input('pid', sql.Int, productoId)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    let formulaId;
    if (existing.recordset.length) {
      formulaId = existing.recordset[0].id;
      // Limpiar detalle actual
      await rq
        .input('fidD', sql.Int, formulaId)
        .query(`DELETE FROM produccion_formula_detalles WHERE formula_id = @fidD`);
    } else {
      const insCab = await rq
        .input('pid2', sql.Int, productoId)
        .query(`
          INSERT INTO produccion_formulas (producto_id)
          OUTPUT INSERTED.id
          VALUES (@pid2)
        `);
      formulaId = insCab.recordset[0].id;
    }

    // Insertar nuevo detalle
    for (const it of itemsMerged) {
      const matId = idByCode.get(it.cod);
      await rq
        .input('fid', sql.Int, formulaId)
        .input('mid', sql.Int, matId)
        .input('qty', sql.Decimal(18, 2), it.cant)
        .query(`
          INSERT INTO produccion_formula_detalles (formula_id, material_id, cantidad)
          VALUES (@fid, @mid, @qty)
        `);
    }

    await trans.commit();
    return res.json({ message: 'Fórmula reemplazada correctamente', codigo: codigoProducto });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.replaceFormula:', err);
    res.status(500).json({ error: 'Error al reemplazar la fórmula', detalle: err.message });
  }
};


/**
 * DELETE /produccion/formulas/:codigo
 * Elimina la fórmula por código de producto (si existe).
 */
exports.deleteFormulaByCodigo = async (req, res) => {
  const codigo = up(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'Código inválido' });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    const prod = await rq
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
      `);
    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }
    const pid = prod.recordset[0].id_articulo;

    const f = await rq
      .input('pid', sql.Int, pid)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (!f.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'No existe fórmula para este producto' });
    }
    const fid = f.recordset[0].id;

    await rq.input('fidD', sql.Int, fid)
      .query(`DELETE FROM produccion_formula_detalles WHERE formula_id = @fidD`);

    await rq.input('fid', sql.Int, fid)
      .query(`DELETE FROM produccion_formulas WHERE id = @fid`);

    await trans.commit();
    res.json({ message: 'Fórmula eliminada', codigo });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.deleteFormulaByCodigo:', err);
    res.status(500).json({ error: 'Error al eliminar la fórmula', detalle: err.message });
  }
};



/**
 * PUT /produccion/formulas/:codigo
 * Body:
 *   {
 *     "items": [
 *       {"cod_articulo":"MAT001","cantidad": 2},
 *       {"cod_articulo":"MAT002","cantidad": 5}
 *     ]
 *   }
 * Reemplaza la fórmula completa del producto (borra la anterior y carga la nueva).
 */
exports.updateFormula = async (req, res) => {
  const codigoProducto = (req.params?.codigo || '').trim().toUpperCase();
  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!codigoProducto) {
    return res.status(400).json({ error: 'Debe indicar el CÓDIGO del producto' });
  }
  if (!itemsRaw.length) {
    return res.status(400).json({ error: 'Debe incluir al menos un MATERIAL en items' });
  }

  // Normalizar items
  const items = itemsRaw
    .map(it => ({ cod: (it.cod_articulo || '').trim().toUpperCase(), cant: Number(it.cantidad) || 0 }))
    .filter(it => it.cod && it.cant > 0);

  if (!items.length) {
    return res.status(400).json({ error: 'Items inválidos: códigos/cantidades' });
  }

  // Merge duplicados
  const agg = new Map();
  for (const it of items) {
    agg.set(it.cod, (agg.get(it.cod) || 0) + it.cant);
  }
  const itemsMerged = Array.from(agg.entries()).map(([cod, cant]) => ({ cod, cant }));

  if (itemsMerged.some(it => it.cod === codigoProducto)) {
    return res.status(400).json({ error: 'El producto no puede ser material de su propia fórmula' });
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // 1) Producto
    const prod = await rq
      .input('c', sql.VarChar, codigoProducto)
      .query(`
        SELECT id_articulo, cod_articulo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
      `);
    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'El producto no existe' });
    }
    const producto = prod.recordset[0];

    // 2) Buscar fórmula existente
    const cab = await rq
      .input('pid', sql.Int, producto.id_articulo)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (!cab.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'No existe fórmula para este producto' });
    }
    const formulaId = cab.recordset[0].id;

    // 3) Validar materiales existen
    const inList = itemsMerged.map((_, i) => `@m${i}`).join(',');
    itemsMerged.forEach((it, i) => rq.input(`m${i}`, sql.VarChar, it.cod));
    const mats = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(cod_articulo))) AS cod, descripcion
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${inList})
    `);
    const idByCode = new Map(mats.recordset.map(r => [r.cod, r.id_articulo]));
    const descByCode = new Map(mats.recordset.map(r => [r.cod, r.descripcion]));
    const faltantes = itemsMerged.filter(it => !idByCode.has(it.cod)).map(it => it.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'Materiales inexistentes', detalle: faltantes });
    }

    // 4) Borrar detalles anteriores
    await rq.input('fid', sql.Int, formulaId).query(`DELETE FROM produccion_formula_detalles WHERE formula_id = @fid`);

    // 5) Insertar nuevos detalles
    for (const it of itemsMerged) {
      const matId = idByCode.get(it.cod);
      await rq
        .input('fid', sql.Int, formulaId)
        .input('mid', sql.Int, matId)
        .input('qty', sql.Decimal(18, 2), it.cant)
        .query(`
          INSERT INTO produccion_formula_detalles (formula_id, material_id, cantidad)
          VALUES (@fid, @mid, @qty)
        `);
    }

    await trans.commit();

    const detalle = itemsMerged.map(it => ({
      cod_articulo: it.cod,
      descripcion: descByCode.get(it.cod) || '',
      cantidad: it.cant
    }));

    res.json({
      message: 'Fórmula actualizada correctamente',
      producto,
      detalle
    });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.updateFormula:', err);
    res.status(500).json({ error: 'Error al actualizar la fórmula', detalle: err.message });
  }
};

exports.updateFormula = (req, res) => {
  req.body = { ...(req.body || {}), codigo: req.params.codigo };
  return exports.replaceFormula(req, res);
};

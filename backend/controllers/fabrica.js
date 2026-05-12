// backend/controllers/fabrica.js
const { sql, poolConnect, getPool } = require("../db");

const toDb = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const up = (v) => (toDb(v)?.toUpperCase() ?? null);

const getUserId = (req) => {
  const u = req.user || {};
  const id =
    u.id_usuario ??
    u.id ??
    u.userId ??
    u.usuario_id ??
    u.uid ??
    u.sub ??
    u?.user?.id_usuario ??
    u?.user?.id ??
    u?.user?.userId;

  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * POST /fabrica/ordenes
 */
exports.create = async (req, res) => {
  const codigo = up(req.body?.codigo);
  const depO = Number(req.body?.deposito_origen_id);
  const depD = Number(req.body?.deposito_destino_id);
  const cant = Number(req.body?.cantidad);

  if (!codigo || !depO || !depD || !cant || cant <= 0) {
    return res.status(400).json({ error: "Datos incompletos o inválidos" });
  }

  const idUsuario = getUserId(req);
  if (!idUsuario) {
    return res.status(401).json({ error: "No se pudo identificar el usuario (req.user vacío o sin id)" });
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    const newReq = () => new sql.Request(trans);

    // Producto
    const pr = await newReq()
      .input("c", sql.VarChar, codigo)
      .query(`
        SELECT id_articulo, cod_articulo, cod_barra, descripcion
        FROM dbo.articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @c
           OR UPPER(LTRIM(RTRIM(cod_barra)))  = @c
      `);

    if (!pr.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: "Artículo (producto) no encontrado" });
    }
    const producto = pr.recordset[0];
    const productoId = producto.id_articulo;

    // Fórmula
    const fc = await newReq()
      .input("pid", sql.Int, productoId)
      .query(`SELECT id FROM dbo.produccion_formulas WHERE producto_id = @pid`);

    if (!fc.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: "No existe fórmula de producción para este código" });
    }
    const fid = fc.recordset[0].id;

    const det = await newReq()
      .input("fid", sql.Int, fid)
      .query(`
        SELECT d.material_id, d.cantidad AS cant_por_unidad,
               a.cod_articulo, a.descripcion
        FROM dbo.produccion_formula_detalles d
        JOIN dbo.articulos a ON a.id_articulo = d.material_id
        WHERE d.formula_id = @fid
        ORDER BY a.cod_articulo
      `);

    if (!det.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: "La fórmula no tiene materiales cargados" });
    }

    // Validar stock materiales
    const faltantes = [];
    for (const row of det.recordset) {
      const reqQty = Number(row.cant_por_unidad) * cant;

      const chk = await newReq()
        .input("idArt", sql.Int, row.material_id)
        .input("idDep", sql.Int, depO)
        .query(`
          SELECT ISNULL(SUM(cantidad),0) AS q
          FROM dbo.stock
          WHERE id_articulo = @idArt AND id_deposito = @idDep
        `);

      const disponible = Number(chk.recordset[0]?.q || 0);
      if (disponible < reqQty) {
        faltantes.push({ cod_articulo: row.cod_articulo, requerido: reqQty, disponible });
      }
    }

    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Stock insuficiente en depósito origen", faltantes });
    }

    // Insert cabecera (GUARDA id_usuario)
    const ins = await newReq()
      .input("depO", sql.Int, depO)
      .input("depD", sql.Int, depD)
      .input("pid2", sql.Int, productoId)
      .input("cant", sql.Decimal(18, 2), cant)
      .input("uid", sql.Int, idUsuario)
      .query(`
        INSERT INTO dbo.produccion_ordenes
          (deposito_origen_id, deposito_destino_id, producto_id, cantidad, id_usuario)
        OUTPUT INSERTED.id
        VALUES (@depO, @depD, @pid2, @cant, @uid)
      `);

    const ordenId = ins.recordset[0].id;

    // numero_orden = id (si existe la columna numero_orden)
    await newReq()
      .input("id", sql.Int, ordenId)
      .query(`
        UPDATE dbo.produccion_ordenes
           SET numero_orden = CAST(id AS VARCHAR(20))
         WHERE id = @id
      `);

    // Detalle + consumir materiales
    for (const row of det.recordset) {
      const consume = Number(row.cant_por_unidad) * cant;

      await newReq()
        .input("oid", sql.Int, ordenId)
        .input("mid", sql.Int, row.material_id)
        .input("qty", sql.Decimal(18, 2), consume)
        .query(`
          INSERT INTO dbo.produccion_orden_detalles (orden_id, material_id, cantidad)
          VALUES (@oid, @mid, @qty)
        `);

      await newReq()
        .input("dep", sql.Int, depO)
        .input("art", sql.Int, row.material_id)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @dep AND id_articulo = @art)
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@dep, @art, 0);
        `);

      await newReq()
        .input("dep", sql.Int, depO)
        .input("art", sql.Int, row.material_id)
        .input("c", sql.Decimal(18, 2), consume)
        .query(`
          UPDATE dbo.stock
             SET cantidad = cantidad - @c
           WHERE id_deposito = @dep AND id_articulo = @art;
        `);
    }

    // Alta producto terminado
    await newReq()
      .input("dep", sql.Int, depD)
      .input("art", sql.Int, productoId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @dep AND id_articulo = @art)
          INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@dep, @art, 0);
      `);

    await newReq()
      .input("dep", sql.Int, depD)
      .input("art", sql.Int, productoId)
      .input("c", sql.Decimal(18, 2), cant)
      .query(`
        UPDATE dbo.stock
           SET cantidad = cantidad + @c
         WHERE id_deposito = @dep AND id_articulo = @art;
      `);

    await trans.commit();

    const full = await (await getPool()).request()
      .input("oid", sql.Int, ordenId)
      .query(`
        SELECT 
          o.id, o.numero_orden, o.fecha, o.cantidad,
          d1.nombre AS deposito_origen, d2.nombre AS deposito_destino,
          a.cod_articulo AS codigo, a.descripcion,
          COALESCE(u.nombre, u.username, u.email, '') AS usuario
        FROM dbo.produccion_ordenes o
        JOIN dbo.depositos d1 ON d1.id_deposito = o.deposito_origen_id
        JOIN dbo.depositos d2 ON d2.id_deposito = o.deposito_destino_id
        JOIN dbo.articulos a ON a.id_articulo = o.producto_id
        LEFT JOIN dbo.usuarios u ON u.id_usuario = o.id_usuario
        WHERE o.id = @oid
      `);

    res.status(201).json({ message: "Orden de producción creada", orden: full.recordset[0] });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error("fabrica.create:", err);
    res.status(500).json({ error: "Error al crear orden de producción", detalle: err.message });
  }
};

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        o.id, o.numero_orden, o.fecha, o.cantidad,
        d1.nombre AS deposito_origen, d2.nombre AS deposito_destino,
        a.cod_articulo AS codigo, a.descripcion,
        COALESCE(u.nombre, u.username, u.email, '') AS usuario
      FROM dbo.produccion_ordenes o
      JOIN dbo.depositos d1 ON d1.id_deposito = o.deposito_origen_id
      JOIN dbo.depositos d2 ON d2.id_deposito = o.deposito_destino_id
      JOIN dbo.articulos a ON a.id_articulo = o.producto_id
      LEFT JOIN dbo.usuarios u ON u.id_usuario = o.id_usuario
      ORDER BY o.fecha DESC, o.id DESC
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error("fabrica.getAll:", err);
    res.status(500).json({ error: "Error al listar órdenes", detalle: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const cab = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
          o.id, o.numero_orden, o.fecha, o.cantidad,
          d1.nombre AS deposito_origen, d2.nombre AS deposito_destino,
          a.cod_articulo AS codigo, a.descripcion,
          COALESCE(u.nombre, u.username, u.email, '') AS usuario
        FROM dbo.produccion_ordenes o
        JOIN dbo.depositos d1 ON d1.id_deposito = o.deposito_origen_id
        JOIN dbo.depositos d2 ON d2.id_deposito = o.deposito_destino_id
        JOIN dbo.articulos a ON a.id_articulo = o.producto_id
        LEFT JOIN dbo.usuarios u ON u.id_usuario = o.id_usuario
        WHERE o.id = @id
      `);

    if (!cab.recordset.length) return res.status(404).json({ error: "Orden no encontrada" });

    const det = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT a.cod_articulo, a.descripcion, d.cantidad
        FROM dbo.produccion_orden_detalles d
        JOIN dbo.articulos a ON a.id_articulo = d.material_id
        WHERE d.orden_id = @id
        ORDER BY a.cod_articulo
      `);

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset });
  } catch (err) {
    console.error("fabrica.getById:", err);
    res.status(500).json({ error: "Error al obtener orden", detalle: err.message });
  }
};

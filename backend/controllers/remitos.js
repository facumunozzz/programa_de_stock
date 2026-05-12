const { sql, poolConnect, getPool } = require("../db");

const toDb = (v) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();

const getUserName = (req) => {
  const u = req.user || {};
  return u.nombre || u.username || u.email || "Sistema";
};

async function getArticuloColumn(pool) {
  const r = await pool.request().query(`
    SELECT name
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulos')
      AND name IN ('cod_articulo', 'codigo')
  `);

  const cols = (r.recordset || []).map((x) => x.name);
  if (cols.includes("cod_articulo")) return "cod_articulo";
  if (cols.includes("codigo")) return "codigo";
  throw new Error("La tabla dbo.articulos no tiene columna cod_articulo ni codigo.");
}

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        r.id_remito,
        r.fecha,
        r.tipo,
        r.nro_remito,
        COALESCE(p.nombre, r.proveedor, '') AS proveedor,
        ISNULL(r.usuario, '') AS usuario,
        r.estado
      FROM dbo.remitos r
      LEFT JOIN dbo.remito_proveedores p
        ON p.id_proveedor = r.id_proveedor
      ORDER BY r.fecha DESC, r.id_remito DESC
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("remitos.getAll:", err);
    res.status(500).json({
      error: "Error al listar remitos",
      detalle: err.message,
    });
  }
};

exports.getProximoNumero = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT ISNULL(MAX(id_remito), 0) + 1 AS proximo
      FROM dbo.remitos
    `);

    const n = Number(r.recordset[0]?.proximo || 1);
    const numero = `0001-${String(n).padStart(5, "0")}`;

    res.json({ numero_remito: numero });
  } catch (err) {
    console.error("remitos.getProximoNumero:", err);
    res.status(500).json({
      error: "Error al generar número de remito",
      detalle: err.message,
    });
  }
};

exports.create = async (req, res) => {
  const {
    tipo,
    id_proveedor,
    proveedor,
    material_codigo,
    material_descripcion,
    cantidad_padre,
    cantidad_bultos,
    items,
  } = req.body || {};

  const tipoNorm = String(tipo || "").toUpperCase();

  if (!["INGRESO", "EGRESO"].includes(tipoNorm)) {
    return res.status(400).json({ error: "Tipo inválido. Debe ser INGRESO o EGRESO." });
  }

  if (!id_proveedor) {
    return res.status(400).json({ error: "Debe indicar proveedor." });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Debe incluir materiales." });
  }

  let trans;

  try {
    await poolConnect;
    const pool = await getPool();
    const articuloCol = await getArticuloColumn(pool);

    trans = new sql.Transaction(pool);
    await trans.begin();

    const rq = () => new sql.Request(trans);

    const ins = await rq()
      .input("tipo", sql.NVarChar, tipoNorm)
      .input("idProveedor", sql.Int, Number(id_proveedor))
      .input("proveedor", sql.NVarChar, toDb(proveedor))
      .input("usuario", sql.NVarChar, getUserName(req))
      .input("materialCodigo", sql.NVarChar, toDb(material_codigo))
      .input("materialDesc", sql.NVarChar, toDb(material_descripcion))
      .input("cantPadre", sql.Decimal(18, 2), Number(cantidad_padre || 0))
      .input("cantBultos", sql.Decimal(18, 2), Number(cantidad_bultos || 0))
      .query(`
        INSERT INTO dbo.remitos
          (nro_remito, tipo, id_proveedor, proveedor, usuario, fecha, estado,
           material_codigo, material_descripcion, cantidad_padre, cantidad_bultos)
        OUTPUT INSERTED.id_remito
        VALUES
          ('PENDIENTE', @tipo, @idProveedor, @proveedor, @usuario, GETDATE(), 'GUARDADO',
           @materialCodigo, @materialDesc, @cantPadre, @cantBultos)
      `);

    const idRemito = ins.recordset[0].id_remito;
    const nroRemito = `0001-${String(idRemito).padStart(5, "0")}`;

    await rq()
      .input("id", sql.Int, idRemito)
      .input("nro", sql.NVarChar, nroRemito)
      .query(`
        UPDATE dbo.remitos
           SET nro_remito = @nro
         WHERE id_remito = @id
      `);

    const signo = tipoNorm === "INGRESO" ? 1 : -1;

    for (const it of items) {
      const codigo = toDb(it.codigo);
      const depositoId = Number(it.deposito_id);
      const cantidad = Number(it.cantidad || 0);

      if (!codigo || !depositoId || !Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error("Ítem inválido en detalle de remito.");
      }

      const art = await rq()
        .input("codigo", sql.NVarChar, codigo)
        .query(`
          SELECT TOP 1 id_articulo
          FROM dbo.articulos
          WHERE UPPER(LTRIM(RTRIM(${articuloCol}))) = UPPER(LTRIM(RTRIM(@codigo)))
        `);

      if (!art.recordset.length) {
        throw new Error(`Artículo no encontrado: ${codigo}`);
      }

      const idArticulo = art.recordset[0].id_articulo;

      await rq()
        .input("idRemito", sql.Int, idRemito)
        .input("codigo", sql.NVarChar, codigo)
        .input("descripcion", sql.NVarChar, toDb(it.descripcion))
        .input("bultos", sql.Decimal(18, 2), Number(it.bultos || 0))
        .input("cantidad", sql.Decimal(18, 2), cantidad)
        .input("um", sql.NVarChar, toDb(it.um))
        .input("control", sql.NVarChar, toDb(it.control))
        .input("observaciones", sql.NVarChar, toDb(it.observaciones))
        .input("depositoId", sql.Int, depositoId)
        .query(`
          INSERT INTO dbo.remito_detalles
            (id_remito, codigo, descripcion, bultos, cantidad, um, control, observaciones, deposito_id)
          VALUES
            (@idRemito, @codigo, @descripcion, @bultos, @cantidad, @um, @control, @observaciones, @depositoId)
        `);

      const delta = cantidad * signo;

      if (delta < 0) {
        const chk = await rq()
          .input("idArt", sql.Int, idArticulo)
          .input("idDep", sql.Int, depositoId)
          .query(`
            SELECT ISNULL(SUM(cantidad),0) AS disponible
            FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
            WHERE id_articulo = @idArt
              AND id_deposito = @idDep
          `);

        const disponible = Number(chk.recordset[0]?.disponible || 0);

        if (disponible + delta < 0) {
          throw new Error(`Stock insuficiente para ${codigo}. Disponible: ${disponible}, requerido: ${cantidad}`);
        }
      }

      await rq()
        .input("idArt", sql.Int, idArticulo)
        .input("idDep", sql.Int, depositoId)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.stock
            WHERE id_articulo = @idArt
              AND id_deposito = @idDep
          )
          INSERT INTO dbo.stock (id_articulo, id_deposito, cantidad)
          VALUES (@idArt, @idDep, 0)
        `);

      await rq()
        .input("idArt", sql.Int, idArticulo)
        .input("idDep", sql.Int, depositoId)
        .input("delta", sql.Decimal(18, 2), delta)
        .query(`
          UPDATE dbo.stock
             SET cantidad = cantidad + @delta
           WHERE id_articulo = @idArt
             AND id_deposito = @idDep
        `);
    }

    await trans.commit();

    res.status(201).json({
      message: "Remito guardado correctamente",
      remito: {
        id_remito: idRemito,
        nro_remito: nroRemito,
      },
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("remitos.create:", err);
    res.status(500).json({
      error: "Error al guardar remito",
      detalle: err.message,
    });
  }
};

// ========================================================
// ARTÍCULOS CON FÓRMULA PARA REMITOS
// ========================================================
exports.getArticulosConFormula = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        a.id_articulo,
        a.cod_articulo,
        a.descripcion,
        CASE 
          WHEN ra.id_articulo IS NULL THEN CAST(0 AS BIT)
          ELSE ra.activo
        END AS activo
      FROM dbo.articulos a
      INNER JOIN dbo.produccion_formulas f
        ON f.producto_id = a.id_articulo
      LEFT JOIN dbo.remito_articulos ra
        ON ra.id_articulo = a.id_articulo
      ORDER BY a.cod_articulo
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("remitos.getArticulosConFormula:", err);
    res.status(500).json({
      error: "Error al listar artículos con fórmula",
      detalle: err.message,
    });
  }
};

// ========================================================
// SOLO ARTÍCULOS ACTIVOS PARA USAR EN REMITOS
// ========================================================
exports.getArticulosActivos = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        a.id_articulo,
        a.cod_articulo,
        a.descripcion
      FROM dbo.remito_articulos ra
      INNER JOIN dbo.articulos a
        ON a.id_articulo = ra.id_articulo
      INNER JOIN dbo.produccion_formulas f
        ON f.producto_id = a.id_articulo
      WHERE ra.activo = 1
      ORDER BY a.cod_articulo
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("remitos.getArticulosActivos:", err);
    res.status(500).json({
      error: "Error al listar artículos activos para remitos",
      detalle: err.message,
    });
  }
};

// ========================================================
// ACTIVAR / DESACTIVAR ARTÍCULO PARA REMITOS
// ========================================================
exports.toggleArticuloRemito = async (req, res) => {
  try {
    const idArticulo = Number(req.params.id);
    const activo = req.body?.activo === true || req.body?.activo === 1;

    if (!idArticulo) {
      return res.status(400).json({ error: "ID de artículo inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const existe = await pool.request()
      .input("id", sql.Int, idArticulo)
      .query(`
        SELECT TOP 1 a.id_articulo
        FROM dbo.articulos a
        INNER JOIN dbo.produccion_formulas f
          ON f.producto_id = a.id_articulo
        WHERE a.id_articulo = @id
      `);

    if (!existe.recordset.length) {
      return res.status(404).json({
        error: "El artículo no existe o no tiene fórmula de producción",
      });
    }

    await pool.request()
      .input("id", sql.Int, idArticulo)
      .input("activo", sql.Bit, activo)
      .query(`
        MERGE dbo.remito_articulos AS target
        USING (
          SELECT @id AS id_articulo, @activo AS activo
        ) AS source
        ON target.id_articulo = source.id_articulo
        WHEN MATCHED THEN
          UPDATE SET 
            activo = source.activo,
            actualizado_en = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (id_articulo, activo, actualizado_en)
          VALUES (source.id_articulo, source.activo, GETDATE());
      `);

    res.json({
      message: activo
        ? "Artículo activado para remitos"
        : "Artículo desactivado para remitos",
    });
  } catch (err) {
    console.error("remitos.toggleArticuloRemito:", err);
    res.status(500).json({
      error: "Error al activar/desactivar artículo",
      detalle: err.message,
    });
  }
};

// ========================================================
// MATERIALES DE UN ARTÍCULO ACTIVO PARA REMITO
// ========================================================
exports.getMaterialesArticuloRemito = async (req, res) => {
  try {
    const codigo = String(req.params.codigo || "").trim().toUpperCase();
    const cantidadPadre = Number(String(req.query.cantidad || "1").replace(",", "."));

    if (!codigo) {
      return res.status(400).json({ error: "Falta código de artículo" });
    }

    if (!Number.isFinite(cantidadPadre) || cantidadPadre <= 0) {
      return res.status(400).json({ error: "Cantidad inválida" });
    }

    await poolConnect;
    const pool = await getPool();

    const productoRes = await pool.request()
      .input("codigo", sql.VarChar, codigo)
      .query(`
        SELECT TOP 1
          a.id_articulo,
          a.cod_articulo,
          a.descripcion
        FROM dbo.articulos a
        INNER JOIN dbo.remito_articulos ra
          ON ra.id_articulo = a.id_articulo
         AND ra.activo = 1
        INNER JOIN dbo.produccion_formulas f
          ON f.producto_id = a.id_articulo
        WHERE UPPER(LTRIM(RTRIM(a.cod_articulo))) = @codigo
      `);

    if (!productoRes.recordset.length) {
      return res.status(404).json({
        error: "El artículo no existe, no tiene fórmula o no está activo para remitos",
      });
    }

    const producto = productoRes.recordset[0];

    const formulaRes = await pool.request()
      .input("idArticulo", sql.Int, producto.id_articulo)
      .query(`
        SELECT TOP 1 id
        FROM dbo.produccion_formulas
        WHERE producto_id = @idArticulo
      `);

    if (!formulaRes.recordset.length) {
      return res.status(404).json({
        error: "El artículo no tiene fórmula de producción",
      });
    }

    const idFormula = formulaRes.recordset[0].id;

    const detRes = await pool.request()
      .input("idFormula", sql.Int, idFormula)
      .input("cantidadPadre", sql.Decimal(18, 2), cantidadPadre)
      .query(`
        SELECT
          a.id_articulo,
          a.cod_articulo AS codigo,
          a.descripcion,
          d.cantidad AS cantidad_por_unidad,
          d.cantidad * @cantidadPadre AS cantidad_total
        FROM dbo.produccion_formula_detalles d
        INNER JOIN dbo.articulos a
          ON a.id_articulo = d.material_id
        WHERE d.formula_id = @idFormula
        ORDER BY a.cod_articulo
      `);

    res.json({
      producto,
      cantidad_padre: cantidadPadre,
      detalle: detRes.recordset || [],
    });
  } catch (err) {
    console.error("remitos.getMaterialesArticuloRemito:", err);
    res.status(500).json({
      error: "Error al obtener materiales del artículo",
      detalle: err.message,
    });
  }
};
// backend/controllers/transferencias.js
const { sql, poolConnect, getPool } = require("../db");

const toDb = (v) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();

const up = (v) => (toDb(v)?.toUpperCase() ?? null);

// Robusto: soporta distintos payloads de usuario
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
 * Resuelve artículos por input:
 * - cod_articulo
 * - cod_barra
 *
 * Prioriza cod_barra si coincide.
 * Devuelve Map<inputUpper, row>
 */
async function resolveArticulosByInputs(trans, inputsUpper) {
  const vals = Array.from(
    new Set((inputsUpper || []).map(up).filter(Boolean))
  );

  if (!vals.length) return new Map();

  const placeholders = vals.map((_, i) => `@v${i}`).join(",");
  const rq = new sql.Request(trans);

  vals.forEach((v, i) => rq.input(`v${i}`, sql.VarChar, v));

  const r = await rq.query(`
    SELECT
      id_articulo,
      cod_articulo,
      cod_barra,
      descripcion,
      UPPER(LTRIM(RTRIM(cod_articulo))) AS cod_articulo_u,
      UPPER(LTRIM(RTRIM(cod_barra))) AS cod_barra_u
    FROM dbo.articulos
    WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${placeholders})
       OR UPPER(LTRIM(RTRIM(cod_barra))) IN (${placeholders})
  `);

  const map = new Map();

  // Prioridad: cod_barra
  for (const row of r.recordset) {
    if (
      row.cod_barra_u &&
      vals.includes(row.cod_barra_u) &&
      !map.has(row.cod_barra_u)
    ) {
      map.set(row.cod_barra_u, row);
    }
  }

  // Fallback: cod_articulo
  for (const row of r.recordset) {
    if (
      row.cod_articulo_u &&
      vals.includes(row.cod_articulo_u) &&
      !map.has(row.cod_articulo_u)
    ) {
      map.set(row.cod_articulo_u, row);
    }
  }

  return map;
}

// ==========================
// LISTADO
// GET /transferencias
// ==========================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT 
        t.numero_transferencia AS id,
        t.numero_transferencia,
        t.origen,
        t.destino,
        ISNULL(t.motivo, '') AS motivo,
        t.fecha,
        COALESCE(u.nombre, u.username, u.email, '') AS usuario
      FROM dbo.transferencias t
      LEFT JOIN dbo.usuarios u
        ON u.id_usuario = t.id_usuario
      ORDER BY t.fecha DESC, t.numero_transferencia DESC
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("transferencias.getAll:", err);

    res.status(500).json({
      error: "Error al listar transferencias",
      detalle: err.message,
    });
  }
};

// ==========================
// DETALLE
// GET /transferencias/:id
// ==========================
exports.getById = async (req, res) => {
  try {
    const numero = Number(req.params.id);

    if (!Number.isInteger(numero)) {
      return res.status(400).json({ error: "Número inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const cab = await pool
      .request()
      .input("n", sql.Int, numero)
      .query(`
        SELECT 
          t.numero_transferencia AS id,
          t.numero_transferencia,
          t.origen,
          t.destino,
          ISNULL(t.motivo, '') AS motivo,
          t.fecha,
          COALESCE(u.nombre, u.username, u.email, '') AS usuario
        FROM dbo.transferencias t
        LEFT JOIN dbo.usuarios u
          ON u.id_usuario = t.id_usuario
        WHERE t.numero_transferencia = @n
      `);

    if (!cab.recordset.length) {
      return res.status(404).json({ error: "Transferencia no encontrada" });
    }

    const det = await pool
      .request()
      .input("n", sql.Int, numero)
      .query(`
        SELECT 
          transferencia_id,
          cod_articulo,
          descripcion,
          cantidad
        FROM dbo.transferencia_detalles
        WHERE transferencia_id = @n
        ORDER BY cod_articulo
      `);

    res.json({
      cabecera: cab.recordset[0],
      detalle: det.recordset || [],
    });
  } catch (err) {
    console.error("transferencias.getById:", err);

    res.status(500).json({
      error: "Error al obtener detalle",
      detalle: err.message,
    });
  }
};

// ==========================
// CREAR
// POST /transferencias
//
// body:
// {
//   origen_id,
//   destino_id,
//   motivo,
//   items: [
//     { cod_articulo | cod_barra | codigo, cantidad }
//   ]
// }
// ==========================
exports.create = async (req, res) => {
  const { origen_id, destino_id, motivo, items } = req.body || {};

  if (!origen_id || !destino_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  if (Number(origen_id) === Number(destino_id)) {
    return res.status(400).json({
      error: "Origen y destino no pueden ser iguales",
    });
  }

  if (!toDb(motivo)) {
    return res.status(400).json({
      error: "Debe seleccionar un motivo",
    });
  }

  const normItems = items
    .map((it) => ({
      input: up(it.cod_barra ?? it.cod_articulo ?? it.codigo),
      cant: Number(it.cantidad),
    }))
    .filter((it) => it.input && Number.isFinite(it.cant) && it.cant > 0);

  if (!normItems.length) {
    return res.status(400).json({ error: "Items inválidos" });
  }

  const idUsuario = getUserId(req);

  if (!idUsuario) {
    return res.status(401).json({
      error: "No se pudo identificar el usuario (req.user vacío o sin id)",
    });
  }

  let trans;

  try {
    await poolConnect;
    const pool = await getPool();

    trans = new sql.Transaction(pool);
    await trans.begin();

    const newReq = () => new sql.Request(trans);

    // Depósito origen
    const depO = await newReq()
      .input("o", sql.Int, origen_id)
      .query(`
        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @o
      `);

    if (!depO.recordset.length) {
      throw new Error("Depósito origen inexistente");
    }

    // Depósito destino
    const depD = await newReq()
      .input("d", sql.Int, destino_id)
      .query(`
        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @d
      `);

    if (!depD.recordset.length) {
      throw new Error("Depósito destino inexistente");
    }

    // Resolver artículos
    const inputs = normItems.map((i) => i.input);
    const artByInput = await resolveArticulosByInputs(trans, inputs);

    const faltantes = normItems
      .filter((i) => !artByInput.has(i.input))
      .map((i) => i.input);

    if (faltantes.length) {
      await trans.rollback();

      return res.status(400).json({
        error: "Códigos inexistentes",
        detalle: faltantes,
      });
    }

    // Validar stock en origen
    for (const it of normItems) {
      const art = artByInput.get(it.input);

      const chk = await newReq()
        .input("idArt", sql.Int, art.id_articulo)
        .input("idDep", sql.Int, origen_id)
        .query(`
          SELECT ISNULL(SUM(cantidad), 0) AS q
          FROM dbo.stock
          WHERE id_articulo = @idArt
            AND id_deposito = @idDep
        `);

      const disponible = Number(chk.recordset[0]?.q || 0);

      if (disponible < it.cant) {
        await trans.rollback();

        return res.status(400).json({
          error: "Stock insuficiente",
          detalle: {
            codigo: it.input,
            disponible,
            solicitado: it.cant,
          },
        });
      }
    }

    // Número de transferencia con lock
    const nroRes = await newReq().query(`
      SELECT ISNULL(MAX(numero_transferencia), 0) + 1 AS n
      FROM dbo.transferencias WITH (UPDLOCK, HOLDLOCK)
    `);

    const nro = Number(nroRes.recordset[0].n);

    // Cabecera
    await newReq()
      .input("n", sql.Int, nro)
      .input("o", sql.VarChar, depO.recordset[0].nombre)
      .input("d", sql.VarChar, depD.recordset[0].nombre)
      .input("mot", sql.VarChar, toDb(motivo))
      .input("uid", sql.Int, idUsuario)
      .query(`
        INSERT INTO dbo.transferencias
          (numero_transferencia, origen, destino, motivo, fecha, id_usuario)
        VALUES
          (@n, @o, @d, @mot, GETDATE(), @uid)
      `);

    // Detalles + stock
    for (const it of normItems) {
      const art = artByInput.get(it.input);

      // Detalle
      await newReq()
        .input("n", sql.Int, nro)
        .input("cod", sql.VarChar, up(art.cod_articulo) || "")
        .input("desc", sql.VarChar, art.descripcion || "")
        .input("cant", sql.Decimal(18, 2), it.cant)
        .query(`
          INSERT INTO dbo.transferencia_detalles
            (transferencia_id, cod_articulo, descripcion, cantidad)
          VALUES
            (@n, @cod, @desc, @cant)
        `);

      // Origen: resta
      await newReq()
        .input("idArt", sql.Int, art.id_articulo)
        .input("idDep", sql.Int, origen_id)
        .input("c", sql.Decimal(18, 2), it.cant)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.stock
            WHERE id_articulo = @idArt
              AND id_deposito = @idDep
          )
          BEGIN
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad)
            VALUES (@idDep, @idArt, 0);
          END;

          UPDATE dbo.stock
             SET cantidad = cantidad - @c
           WHERE id_articulo = @idArt
             AND id_deposito = @idDep;
        `);

      // Destino: suma
      await newReq()
        .input("idArt", sql.Int, art.id_articulo)
        .input("idDep", sql.Int, destino_id)
        .input("c", sql.Decimal(18, 2), it.cant)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.stock
            WHERE id_articulo = @idArt
              AND id_deposito = @idDep
          )
          BEGIN
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad)
            VALUES (@idDep, @idArt, 0);
          END;

          UPDATE dbo.stock
             SET cantidad = cantidad + @c
           WHERE id_articulo = @idArt
             AND id_deposito = @idDep;
        `);
    }

    await trans.commit();

    res.status(201).json({
      message: "Transferencia creada",
      transferencia: {
        numero_transferencia: nro,
        motivo: toDb(motivo),
      },
      numero_transferencia: nro,
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("transferencias.create:", err);

    res.status(500).json({
      error: "Error al crear transferencia",
      detalle: err.message || String(err),
    });
  }
};
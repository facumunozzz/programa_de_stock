// backend/controllers/ajustes.js
const { sql, poolConnect, getPool } = require("../db");
const XLSX = require("xlsx");

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

async function resolveArticulosByInputs(trans, inputsUpper) {
  const vals = Array.from(new Set((inputsUpper || []).map(up).filter(Boolean)));
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
      UPPER(LTRIM(RTRIM(cod_barra)))  AS cod_barra_u
    FROM dbo.articulos
    WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${placeholders})
       OR UPPER(LTRIM(RTRIM(cod_barra)))  IN (${placeholders})
  `);

  const map = new Map();

  // prioridad cod_barra
  for (const row of r.recordset) {
    const k = row.cod_barra_u;
    if (k && vals.includes(k) && !map.has(k)) map.set(k, row);
  }
  // fallback cod_articulo
  for (const row of r.recordset) {
    const k = row.cod_articulo_u;
    if (k && vals.includes(k) && !map.has(k)) map.set(k, row);
  }

  return map;
}

/**
 * GET /ajustes/articulo?codigo=XXXX
 */
exports.getArticuloByCodigo = async (req, res) => {
  const codigo = up(req.query.codigo);
  if (!codigo) return res.status(400).json({ error: "Falta código" });

  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("c", sql.VarChar, codigo)
      .query(`
        SELECT TOP 1
          id_articulo,
          cod_articulo,
          cod_barra,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(LTRIM(RTRIM(cod_barra))) = UPPER(@c)
           OR UPPER(LTRIM(RTRIM(cod_articulo))) = UPPER(@c)
        ORDER BY
          CASE
            WHEN UPPER(LTRIM(RTRIM(cod_barra))) = UPPER(@c) THEN 0
            ELSE 1
          END
      `);

    if (!r.recordset.length) return res.status(404).json({ error: "Artículo no encontrado" });
    return res.json(r.recordset[0]);
  } catch (err) {
    console.error("ajustes.getArticuloByCodigo:", err);
    return res.status(500).json({ error: "Error buscando artículo", detalle: err.message });
  }
};

// GET /ajustes
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        a.numero_ajuste AS id,
        a.numero_ajuste,
        a.deposito,
        a.motivo,
        a.fecha,
        COALESCE(u.nombre, u.username, u.email, '') AS usuario
      FROM dbo.ajustes a
      LEFT JOIN dbo.usuarios u ON u.id_usuario = a.id_usuario
      ORDER BY a.fecha DESC, a.numero_ajuste DESC
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error("ajustes.getAll:", err);
    res.status(500).json({ error: "Error al listar ajustes", detalle: err.message });
  }
};

// GET /ajustes/:id
exports.getById = async (req, res) => {
  try {
    const nro = Number(req.params.id);
    if (!Number.isInteger(nro)) return res.status(400).json({ error: "Número inválido" });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool.request().input("n", sql.Int, nro).query(`
      SELECT 
        a.numero_ajuste AS id,
        a.numero_ajuste,
        a.deposito,
        a.motivo,
        a.fecha,
        COALESCE(u.nombre, u.username, u.email, '') AS usuario
      FROM dbo.ajustes a
      LEFT JOIN dbo.usuarios u ON u.id_usuario = a.id_usuario
      WHERE a.numero_ajuste = @n
    `);
    if (!cab.recordset.length) return res.status(404).json({ error: "Ajuste no encontrado" });

    const det = await pool.request().input("n", sql.Int, nro).query(`
      SELECT 
        ajuste_id,
        cod_articulo,
        descripcion,
        cantidad
      FROM dbo.ajustes_detalles
      WHERE ajuste_id = @n
      ORDER BY cod_articulo
    `);

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset });
  } catch (err) {
    console.error("ajustes.getById:", err);
    res.status(500).json({ error: "Error al obtener detalle", detalle: err.message });
  }
};

// POST /ajustes
exports.create = async (req, res) => {
  const { deposito_id, motivo, items } = req.body || {};

  if (!deposito_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Datos incompletos: depósito e items son obligatorios" });
  }

  const idUsuario = getUserId(req);
  if (!idUsuario) {
    return res.status(401).json({ error: "No se pudo identificar el usuario (req.user vacío o sin id)" });
  }

  const normItems = items
    .map((it) => {
      const input = up(it.cod_barra ?? it.cod_articulo ?? it.codigo);
      const cant = Number(it.cantidad);
      return { input, cant };
    })
    .filter((it) => it.input && Number.isFinite(it.cant) && it.cant !== 0);

  if (!normItems.length) return res.status(400).json({ error: "Items inválidos" });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    const newReq = () => new sql.Request(trans);

    // depósito
    const dep = await newReq()
      .input("d", sql.Int, deposito_id)
      .query(`SELECT id_deposito, nombre FROM dbo.depositos WHERE id_deposito = @d`);
    if (!dep.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: `Depósito inexistente: ${deposito_id}` });
    }
    const nombreDeposito = dep.recordset[0].nombre;

    // resolver artículos
    const inputs = normItems.map((i) => i.input);
    const byInput = await resolveArticulosByInputs(trans, inputs);

    const faltantes = normItems.filter((i) => !byInput.has(i.input)).map((i) => i.input);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Códigos/cód barras inexistentes", detalle: faltantes });
    }

    // validar stock post-ajuste
    for (const it of normItems) {
      const art = byInput.get(it.input);

      const chk = await newReq()
        .input("idArt", sql.Int, art.id_articulo)
        .input("idDep", sql.Int, deposito_id)
        .query(`
          SELECT ISNULL(SUM(cantidad),0) AS q
          FROM dbo.stock
          WHERE id_articulo = @idArt AND id_deposito = @idDep
        `);

      const disponible = Number(chk.recordset[0]?.q || 0);
      const proyectado = disponible + it.cant;
      if (proyectado < 0) {
        await trans.rollback();
        return res.status(400).json({
          error: "Stock insuficiente para ajustar",
          detalle: {
            input: it.input,
            cod_articulo: art.cod_articulo,
            cod_barra: art.cod_barra,
            disponible,
            intento_ajuste: it.cant,
            quedaría: proyectado,
          },
        });
      }
    }

    // nro ajuste con lock
    const nroRes = await newReq().query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
    `);
    const nextNro = Number(nroRes.recordset[0].nextNro);

    // cabecera (GUARDA id_usuario)
    await newReq()
      .input("nro", sql.Int, nextNro)
      .input("depNom", sql.VarChar, nombreDeposito)
      .input("mot", sql.VarChar, toDb(motivo))
      .input("uid", sql.Int, idUsuario)
      .query(`
        INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo, fecha, id_usuario)
        VALUES (@nro, @depNom, @mot, GETDATE(), @uid)
      `);

    // detalle + stock
    for (const it of normItems) {
      const art = byInput.get(it.input);

      await newReq()
        .input("nro", sql.Int, nextNro)
        .input("cod", sql.VarChar, up(art.cod_articulo) || "")
        .input("desc", sql.VarChar, art.descripcion || "")
        .input("cant", sql.Decimal(18, 2), it.cant)
        .query(`
          INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad)
          VALUES (@nro, @cod, @desc, @cant)
        `);

      // asegurar fila stock
      await newReq()
        .input("idDep", sql.Int, deposito_id)
        .input("idArt", sql.Int, art.id_articulo)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @idDep AND id_articulo = @idArt)
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@idDep, @idArt, 0);
        `);

      // aplicar ajuste
      await newReq()
        .input("idDep", sql.Int, deposito_id)
        .input("idArt", sql.Int, art.id_articulo)
        .input("delta", sql.Decimal(18, 2), it.cant)
        .query(`
          UPDATE dbo.stock
             SET cantidad = cantidad + @delta
           WHERE id_deposito = @idDep AND id_articulo = @idArt;
        `);
    }

    await trans.commit();

    const creado = await (await getPool())
      .request()
      .input("n", sql.Int, nextNro)
      .query(`
        SELECT 
          numero_ajuste AS id,
          numero_ajuste,
          deposito,
          motivo,
          fecha,
          id_usuario
        FROM dbo.ajustes
        WHERE numero_ajuste = @n
      `);

    return res.status(201).json({ message: "Ajuste creado", ajuste: creado.recordset[0] });
  } catch (err) {
    console.error("ajustes.create:", err);
    try { if (trans) await trans.rollback(); } catch {}
    return res.status(500).json({ error: "Error al crear ajuste", detalle: err.message });
  }
};

// Descargar plantilla Excel
exports.downloadTemplate = (_req, res) => {
  try {
    const data = [["Cod Barra (o Código)", "Tipo de movimiento", "Depósito", "Cantidad"]];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ajustes");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="Plantilla_Ajustes.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("downloadTemplate:", err);
    return res.status(500).json({ error: "Error al generar plantilla", detalle: err.message });
  }
};

// Importar Excel (requiere usuario)
exports.importarDesdeExcel = async (req, res) => {
  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: "No se pudo identificar el usuario (req.user vacío o sin id)" });

  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

  // 1) Leer Excel
  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  } catch (err) {
    return res.status(400).json({ error: "Archivo inválido", detalle: err.message });
  }

  rows.shift(); // encabezado

  // 2) Parse + validaciones base
  const errores = [];
  const movimientos = [];

  rows.forEach((r, idx) => {
    const filaExcel = idx + 2;
    const [codigoRaw, tipoRaw, depositoRaw, cantidadRaw] = r;

    const input = up(codigoRaw);
    const depositoNombre = toDb(depositoRaw)?.trim().toUpperCase();
    const tipo = String(tipoRaw || "").trim().toUpperCase();
    const cantidad = Number(cantidadRaw);

    if (!input || !depositoNombre || !Number.isFinite(cantidad) || cantidad <= 0) {
      errores.push({ fila: filaExcel, error: "Datos incompletos o cantidad inválida" });
      return;
    }
    if (!["ENTRADA", "SALIDA"].includes(tipo)) {
      errores.push({ fila: filaExcel, error: "Tipo inválido (Entrada/Salida)" });
      return;
    }

    movimientos.push({ fila: filaExcel, input, depositoNombre, tipo, cantidad });
  });

  if (errores.length) return res.status(400).json({ errores });

  // 3) Agrupar por depósito
  const porDeposito = new Map();
  for (const m of movimientos) {
    const key = m.depositoNombre.trim().toUpperCase();
    if (!porDeposito.has(key)) porDeposito.set(key, []);
    porDeposito.get(key).push(m);
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    const newReq = () => new sql.Request(trans);

    const ajustesGenerados = [];

    // 4) Resolver depósitos
    const depositosNombres = Array.from(porDeposito.keys()).map((d) => d.trim().toUpperCase());
    const depPlaceholders = depositosNombres.map((_, i) => `@d${i}`).join(",");
    const rqDeps = newReq();
    depositosNombres.forEach((d, i) => rqDeps.input(`d${i}`, sql.VarChar, d));

    const depsRes = await rqDeps.query(`
      SELECT id_deposito, UPPER(LTRIM(RTRIM(nombre))) AS nombre
      FROM dbo.depositos
      WHERE UPPER(LTRIM(RTRIM(nombre))) IN (${depPlaceholders})
    `);

    const depByNombre = new Map(depsRes.recordset.map((r) => [r.nombre, r.id_deposito]));
    const depsFaltan = depositosNombres.filter((n) => !depByNombre.has(n));
    if (depsFaltan.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Depósitos inexistentes", detalle: depsFaltan });
    }

    // 5) Resolver artículos para todos los inputs
    const inputsAll = Array.from(new Set(movimientos.map((m) => m.input)));
    const artByInput = await resolveArticulosByInputs(trans, inputsAll);

    const artFaltan = inputsAll.filter((x) => !artByInput.has(x));
    if (artFaltan.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Códigos/cód barras inexistentes", detalle: artFaltan });
    }

    // 6) Procesar por depósito
    for (const [depNombre, items] of porDeposito.entries()) {
      const deposito_id = depByNombre.get(depNombre);

      const normItems = items
        .map((it) => {
          const signed = it.tipo === "SALIDA" ? -it.cantidad : it.cantidad;
          const art = artByInput.get(it.input);
          return {
            fila: it.fila,
            input: it.input,
            cant: signed,
            id_articulo: art.id_articulo,
            cod_articulo: art.cod_articulo,
            cod_barra: art.cod_barra,
            descripcion: art.descripcion || "",
          };
        })
        .filter((x) => x.cant !== 0);

      // validar stock (no negativo)
      for (const it of normItems) {
        const chk = await newReq()
          .input("idArt", sql.Int, it.id_articulo)
          .input("idDep", sql.Int, deposito_id)
          .query(`
            SELECT ISNULL(SUM(cantidad),0) AS q
            FROM dbo.stock
            WHERE id_articulo = @idArt AND id_deposito = @idDep
          `);

        const disponible = Number(chk.recordset[0]?.q || 0);
        const proyectado = disponible + it.cant;

        if (proyectado < 0) {
          await trans.rollback();
          return res.status(400).json({
            error: "Stock insuficiente en importación",
            detalle: {
              fila: it.fila,
              deposito: depNombre,
              input: it.input,
              cod_articulo: it.cod_articulo,
              cod_barra: it.cod_barra,
              disponible,
              intento_ajuste: it.cant,
              quedaría: proyectado,
            },
          });
        }
      }

      // nro ajuste con lock
      const nroRes = await newReq().query(`
        SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
        FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
      `);
      const nextNro = Number(nroRes.recordset[0].nextNro);

      // cabecera (GUARDA id_usuario)
      await newReq()
        .input("nro", sql.Int, nextNro)
        .input("depNom", sql.VarChar, depNombre)
        .input("mot", sql.VarChar, "IMPORTACIÓN EXCEL")
        .input("uid", sql.Int, idUsuario)
        .query(`
          INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo, fecha, id_usuario)
          VALUES (@nro, @depNom, @mot, GETDATE(), @uid)
        `);

      // detalles + stock
      for (const it of normItems) {
        await newReq()
          .input("nro", sql.Int, nextNro)
          .input("cod", sql.VarChar, up(it.cod_articulo) || "")
          .input("desc", sql.VarChar, it.descripcion || "")
          .input("cant", sql.Decimal(18, 2), it.cant)
          .query(`
            INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad)
            VALUES (@nro, @cod, @desc, @cant)
          `);

        await newReq()
          .input("idDep", sql.Int, deposito_id)
          .input("idArt", sql.Int, it.id_articulo)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @idDep AND id_articulo = @idArt)
              INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@idDep, @idArt, 0);
          `);

        await newReq()
          .input("idDep", sql.Int, deposito_id)
          .input("idArt", sql.Int, it.id_articulo)
          .input("delta", sql.Decimal(18, 2), it.cant)
          .query(`
            UPDATE dbo.stock
               SET cantidad = cantidad + @delta
             WHERE id_deposito = @idDep AND id_articulo = @idArt;
          `);
      }

      ajustesGenerados.push({ deposito: depNombre, numero_ajuste: nextNro, filas: normItems.length });
    }

    await trans.commit();
    return res.json({ ok: true, ajustes: ajustesGenerados });
  } catch (err) {
    console.error("importarDesdeExcel:", err);
    try { if (trans) await trans.rollback(); } catch {}
    return res.status(500).json({ error: "Error al importar ajustes", detalle: err.message });
  }
};

// ========================================================
// MOTIVOS DE AJUSTE
// ========================================================

// GET /ajustes/motivos
exports.getMotivos = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT 
        id_motivo,
        nombre,
        activo,
        creado_en
      FROM dbo.ajuste_motivos
      ORDER BY nombre
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("ajustes.getMotivos:", err);
    res.status(500).json({
      error: "Error al listar motivos",
      detalle: err.message,
    });
  }
};

// POST /ajustes/motivos
exports.createMotivo = async (req, res) => {
  try {
    const nombre = toDb(req.body?.nombre)?.toUpperCase();

    if (!nombre) {
      return res.status(400).json({ error: "Debe indicar el nombre del motivo" });
    }

    await poolConnect;
    const pool = await getPool();

    const dup = await pool.request()
      .input("nombre", sql.VarChar, nombre)
      .query(`
        SELECT TOP 1 id_motivo
        FROM dbo.ajuste_motivos
        WHERE UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
      `);

    if (dup.recordset.length) {
      return res.status(409).json({ error: "El motivo ya existe" });
    }

    const r = await pool.request()
      .input("nombre", sql.VarChar, nombre)
      .query(`
        INSERT INTO dbo.ajuste_motivos (nombre, activo)
        OUTPUT INSERTED.id_motivo, INSERTED.nombre, INSERTED.activo
        VALUES (@nombre, 1)
      `);

    res.status(201).json({
      message: "Motivo creado",
      motivo: r.recordset[0],
    });
  } catch (err) {
    console.error("ajustes.createMotivo:", err);
    res.status(500).json({
      error: "Error al crear motivo",
      detalle: err.message,
    });
  }
};

// PUT /ajustes/motivos/:id
exports.updateMotivo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombre = toDb(req.body?.nombre)?.toUpperCase();
    const activo = req.body?.activo === true || req.body?.activo === 1;

    if (!id) {
      return res.status(400).json({ error: "ID inválido" });
    }

    if (!nombre) {
      return res.status(400).json({ error: "Debe indicar el nombre del motivo" });
    }

    await poolConnect;
    const pool = await getPool();

    const dup = await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar, nombre)
      .query(`
        SELECT TOP 1 id_motivo
        FROM dbo.ajuste_motivos
        WHERE UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
          AND id_motivo <> @id
      `);

    if (dup.recordset.length) {
      return res.status(409).json({ error: "Ya existe otro motivo con ese nombre" });
    }

    const r = await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar, nombre)
      .input("activo", sql.Bit, activo)
      .query(`
        UPDATE dbo.ajuste_motivos
           SET nombre = @nombre,
               activo = @activo
         WHERE id_motivo = @id
      `);

    if (r.rowsAffected?.[0] === 0) {
      return res.status(404).json({ error: "Motivo no encontrado" });
    }

    res.json({ message: "Motivo actualizado" });
  } catch (err) {
    console.error("ajustes.updateMotivo:", err);
    res.status(500).json({
      error: "Error al actualizar motivo",
      detalle: err.message,
    });
  }
};

// DELETE /ajustes/motivos/:id
exports.deleteMotivo = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const r = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.ajuste_motivos
        WHERE id_motivo = @id
      `);

    if (r.rowsAffected?.[0] === 0) {
      return res.status(404).json({ error: "Motivo no encontrado" });
    }

    res.json({ message: "Motivo eliminado" });
  } catch (err) {
    console.error("ajustes.deleteMotivo:", err);
    res.status(500).json({
      error: "Error al eliminar motivo",
      detalle: err.message,
    });
  }
};
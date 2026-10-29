const { sql, poolConnect, getPool } = require("../db");

const texto = (v) => String(v ?? "").trim();
const upper = (v) => texto(v).toUpperCase();
const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const entero = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const getUsuario = (req) => req.user?.username ?? req.user?.email ?? req.user?.name ?? req.user?.nombre ?? null;

const getUsuarioId = (req) => {
  const u = req.user || {};
  const id = u.id_usuario ?? u.id ?? u.userId ?? u.usuario_id ?? u.uid ?? u.sub ?? u?.user?.id_usuario ?? u?.user?.id ?? u?.user?.userId;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function ymdLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseYmd(value) {
  const s = texto(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function siguienteDiaHabil(date) {
  const d = new Date(date.getTime());

  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);

  return d;
}

function proximaFechaDesde(fecha, frecuenciaDias) {
  const d = new Date(fecha.getTime());

  d.setDate(d.getDate() + Number(frecuenciaDias || 0));

  return siguienteDiaHabil(d);
}

function normalizarIds(values) {
  const salida = [];
  const vistos = new Set();

  for (const v of Array.isArray(values) ? values : []) {
    const n = entero(v);

    if (Number.isInteger(n) && n > 0 && !vistos.has(n)) {
      vistos.add(n);
      salida.push(n);
    }
  }

  return salida;
}

function agregarListaEnteros(request, prefijo, valores) {
  const ids = normalizarIds(valores);

  if (!ids.length) return { ids, sql: "" };

  const names = ids.map((id, i) => {
    const name = `${prefijo}${i}`;

    request.input(name, sql.Int, id);

    return `@${name}`;
  });

  return {
    ids,
    sql: names.join(","),
  };
}

async function stockActualDeposito(trans, idArticulo, idDeposito) {
  const r = await new sql.Request(trans)
    .input("art", sql.Int, idArticulo)
    .input("dep", sql.Int, idDeposito)
    .query(`
      SELECT CAST(ISNULL(SUM(ISNULL(cantidad,0)),0) AS DECIMAL(18,4)) AS cantidad
      FROM dbo.stock WITH (UPDLOCK,HOLDLOCK)
      WHERE id_articulo=@art AND id_deposito=@dep;
    `);

  return Number(r.recordset?.[0]?.cantidad || 0);
}

async function aplicarDeltaStockDeposito(trans, idArticulo, idDeposito, delta) {
  const d = Number(delta || 0);

  if (Math.abs(d) < 0.0000001) return;

  const filas = await new sql.Request(trans)
    .input("art", sql.Int, idArticulo)
    .input("dep", sql.Int, idDeposito)
    .query(`
      SELECT
        id_stock,
        CAST(ISNULL(cantidad,0) AS DECIMAL(18,4)) AS cantidad,
        CAST(ISNULL(asignado,0) AS DECIMAL(18,4)) AS asignado
      FROM dbo.stock WITH (UPDLOCK,HOLDLOCK)
      WHERE id_articulo=@art
        AND id_deposito=@dep
      ORDER BY ISNULL(cantidad,0) DESC, id_stock;
    `);

  if (d > 0) {
    if (!filas.recordset.length) {
      await new sql.Request(trans)
        .input("art", sql.Int, idArticulo)
        .input("dep", sql.Int, idDeposito)
        .input("delta", sql.Decimal(18, 4), d)
        .query(`
          INSERT INTO dbo.stock (
            id_articulo,
            id_deposito,
            cantidad,
            asignado
          )
          VALUES (
            @art,
            @dep,
            @delta,
            0
          );
        `);

      return;
    }

    await new sql.Request(trans)
      .input("id", sql.Int, Number(filas.recordset[0].id_stock))
      .input("delta", sql.Decimal(18, 4), d)
      .query(`
        UPDATE dbo.stock
        SET cantidad = ISNULL(cantidad,0) + @delta
        WHERE id_stock=@id;
      `);

    return;
  }

  let restante = Math.abs(d);

  for (const fila of filas.recordset) {
    if (restante <= 0.0000001) break;

    const cantidad = Math.max(0, Number(fila.cantidad || 0));

    if (cantidad <= 0) continue;

    const quitar = Math.min(cantidad, restante);

    await new sql.Request(trans)
      .input("id", sql.Int, Number(fila.id_stock))
      .input("q", sql.Decimal(18, 4), quitar)
      .query(`
        UPDATE dbo.stock
        SET cantidad = ISNULL(cantidad,0) - @q
        WHERE id_stock=@id;
      `);

    restante -= quitar;
  }

  if (restante > 0.0001) {
    throw new Error(
      "No hay stock suficiente para aplicar la diferencia negativa.",
    );
  }
}

async function crearCabeceraAjuste(trans, { depositoNombre, motivo, usuarioId }) {
  if (!usuarioId) {
    throw new Error("No se pudo identificar el usuario para registrar el ajuste de recuento.");
  }

  const rN = await new sql.Request(trans).query(`
    SELECT ISNULL(MAX(numero_ajuste),0)+1 AS numero
    FROM dbo.ajustes WITH (UPDLOCK,HOLDLOCK);
  `);

  const nro = Number(rN.recordset[0].numero);

  await new sql.Request(trans)
    .input("n", sql.Int, nro)
    .input("dep", sql.VarChar, depositoNombre)
    .input("mot", sql.VarChar, motivo)
    .input("uid", sql.Int, usuarioId)
    .query(`
      INSERT INTO dbo.ajustes (
        numero_ajuste,
        deposito,
        motivo,
        fecha,
        id_usuario
      )
      VALUES (
        @n,
        @dep,
        @mot,
        GETDATE(),
        @uid
      );
    `);

  return nro;
}

async function insertarDetalleAjuste(trans, { numeroAjuste, codigo, descripcion, delta }) {
  await new sql.Request(trans)
    .input("n", sql.Int, numeroAjuste)
    .input("cod", sql.VarChar, codigo || "")
    .input("des", sql.VarChar, descripcion || "")
    .input("q", sql.Decimal(18, 4), delta)
    .query(`
      INSERT INTO dbo.ajustes_detalles (
        ajuste_id,
        cod_articulo,
        descripcion,
        cantidad
      )
      VALUES (
        @n,
        @cod,
        @des,
        @q
      );
    `);
}

exports.getCategorias = async (_req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        id_categoria,
        codigo,
        nombre,
        dias,
        creado_en,
        actualizado_en
      FROM dbo.recuento_ciclico_categorias WITH (NOLOCK)
      WHERE ISNULL(activo,1)=1
      ORDER BY codigo;
    `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("recuentoCiclico.getCategorias:", err);

    return res.status(500).json({
      error: "No se pudieron obtener las categorías",
      detalle: err.message,
    });
  }
};

exports.crearCategoria = async (req, res) => {
  const codigo = upper(req.body?.codigo);
  const nombre = texto(req.body?.nombre) || codigo;
  const dias = entero(req.body?.dias);

  if (!codigo) {
    return res.status(400).json({
      error: "Debe indicar el código de la categoría",
    });
  }

  if (!Number.isInteger(dias) || dias <= 0) {
    return res.status(400).json({
      error: "Los días deben ser mayores que cero",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();

    const r = await pool.request()
      .input("codigo", sql.NVarChar(20), codigo)
      .input("nombre", sql.NVarChar(100), nombre)
      .input("dias", sql.Int, dias)
      .query(`
        INSERT INTO dbo.recuento_ciclico_categorias (
          codigo,
          nombre,
          dias,
          frecuencia_dias,
          activo
        )
        VALUES (
          @codigo,
          @nombre,
          @dias,
          @dias,
          1
        );

        DECLARE @id INT = SCOPE_IDENTITY();

        SELECT
          id_categoria,
          codigo,
          nombre,
          dias,
          frecuencia_dias,
          activo,
          creado_en,
          actualizado_en
        FROM dbo.recuento_ciclico_categorias
        WHERE id_categoria=@id;
      `);

    return res.status(201).json(r.recordset[0]);
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({
        error: "Ya existe una categoría con ese código",
      });
    }

    console.error("recuentoCiclico.crearCategoria:", err);

    return res.status(500).json({
      error: "No se pudo crear la categoría",
      detalle: err.message,
    });
  }
};

exports.actualizarCategoria = async (req, res) => {
  const id = entero(req.params.id);
  const codigo = upper(req.body?.codigo);
  const nombre = texto(req.body?.nombre) || codigo;
  const dias = entero(req.body?.dias);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Categoría inválida",
    });
  }

  if (!codigo) {
    return res.status(400).json({
      error: "Debe indicar un código",
    });
  }

  if (!Number.isInteger(dias) || dias <= 0) {
    return res.status(400).json({
      error: "Los días deben ser mayores que cero",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();

    const r = await pool.request()
      .input("id", sql.Int, id)
      .input("codigo", sql.NVarChar(20), codigo)
      .input("nombre", sql.NVarChar(100), nombre)
      .input("dias", sql.Int, dias)
      .query(`
        UPDATE dbo.recuento_ciclico_categorias
        SET
          codigo=@codigo,
          nombre=@nombre,
          dias=@dias,
          frecuencia_dias=@dias,
          activo=1,
          actualizado_en=SYSDATETIME()
        WHERE id_categoria=@id;

        IF @@ROWCOUNT = 0
        BEGIN
          SELECT CAST(0 AS BIT) AS encontrado;
          RETURN;
        END;

        SELECT
          id_categoria,
          codigo,
          nombre,
          dias,
          frecuencia_dias,
          activo,
          creado_en,
          actualizado_en
        FROM dbo.recuento_ciclico_categorias
        WHERE id_categoria=@id;
      `);

    if (!r.recordset.length || r.recordset[0]?.encontrado === false) {
      return res.status(404).json({
        error: "Categoría no encontrada",
      });
    }

    return res.json(r.recordset[0]);
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({
        error: "Ya existe otra categoría con ese código",
      });
    }

    console.error("recuentoCiclico.actualizarCategoria:", err);

    return res.status(500).json({
      error: "No se pudo modificar la categoría",
      detalle: err.message,
    });
  }
};

exports.eliminarCategoria = async (req, res) => {
  const id = entero(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Categoría inválida",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();

    const usada = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT COUNT(*) AS cantidad
        FROM dbo.recuento_ciclico_config
        WHERE id_categoria=@id;
      `);

    if (Number(usada.recordset[0].cantidad) > 0) {
      return res.status(409).json({
        error: "La categoría está asignada a artículos. Quitala de esas líneas antes de eliminarla.",
      });
    }

    const r = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.recuento_ciclico_categorias
        WHERE id_categoria=@id;

        SELECT @@ROWCOUNT AS eliminados;
      `);

    return res.json({
      ok: true,
      eliminados: Number(r.recordset?.[0]?.eliminados || 0),
    });
  } catch (err) {
    console.error("recuentoCiclico.eliminarCategoria:", err);

    return res.status(500).json({
      error: "No se pudo eliminar la categoría",
      detalle: err.message,
    });
  }
};

exports.getBase = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();
    const depositoId = entero(req.query?.deposito_id);
    const rq = pool.request();

    let filtro = "";

    if (Number.isInteger(depositoId) && depositoId > 0) {
      rq.input("dep", sql.Int, depositoId);
      filtro = "WHERE p.id_deposito=@dep";
    }

    const r = await rq.query(`
      ;WITH pares AS (
        SELECT DISTINCT
          id_articulo,
          id_deposito
        FROM dbo.stock WITH (NOLOCK)
      )
      SELECT
        p.id_articulo,
        p.id_deposito,
        a.cod_articulo AS codigo,
        a.descripcion,
        CAST(NULL AS NVARCHAR(200)) AS proveedor,
        d.nombre AS deposito,
        rc.id_config,
        rc.id_categoria,
        cat.codigo AS categoria,
        cat.nombre AS categoria_nombre,
        cat.dias AS frecuencia_dias,
        rc.proximo_recuento,
        rc.ultimo_recuento
      FROM pares p
      INNER JOIN dbo.articulos a WITH (NOLOCK)
        ON a.id_articulo=p.id_articulo
      INNER JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito=p.id_deposito
      LEFT JOIN dbo.recuento_ciclico_config rc WITH (NOLOCK)
        ON rc.id_articulo=p.id_articulo
        AND rc.id_deposito=p.id_deposito
      LEFT JOIN dbo.recuento_ciclico_categorias cat WITH (NOLOCK)
        ON cat.id_categoria=rc.id_categoria
      ${filtro}
      ORDER BY
        a.cod_articulo,
        d.nombre;
    `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("recuentoCiclico.getBase:", err);

    return res.status(500).json({
      error: "Error al obtener la base de recuento",
      detalle: err.message,
    });
  }
};

exports.guardarBase = async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!items.length) {
    return res.status(400).json({
      error: "No hay líneas para guardar",
    });
  }

  let trans;

  try {
    await poolConnect;

    trans = new sql.Transaction(await getPool());

    await trans.begin();

    let guardados = 0;

    for (const item of items) {
      const idArticulo = entero(item.id_articulo);
      const idDeposito = entero(item.id_deposito);
      const raw = item.id_categoria;
      const idCategoria = raw === null || raw === "" || raw === undefined ? null : entero(raw);

      if (
        !Number.isInteger(idArticulo) ||
        idArticulo <= 0 ||
        !Number.isInteger(idDeposito) ||
        idDeposito <= 0
      ) {
        throw new Error("Artículo o depósito inválido");
      }

      if (
        idCategoria !== null &&
        (!Number.isInteger(idCategoria) || idCategoria <= 0)
      ) {
        throw new Error("Categoría inválida");
      }

      if (idCategoria !== null) {
        const cat = await new sql.Request(trans)
          .input("cat", sql.Int, idCategoria)
          .query(`
            SELECT id_categoria
            FROM dbo.recuento_ciclico_categorias
            WHERE id_categoria=@cat
              AND ISNULL(activo,1)=1;
          `);

        if (!cat.recordset.length) {
          throw new Error("La categoría seleccionada no existe.");
        }
      }

      let fecha = parseYmd(item.proximo_recuento);

      if (idCategoria === null) fecha = null;

      await new sql.Request(trans)
        .input("art", sql.Int, idArticulo)
        .input("dep", sql.Int, idDeposito)
        .input("cat", sql.Int, idCategoria)
        .input("prox", sql.Date, fecha ? ymdLocal(fecha) : null)
        .query(`
          MERGE dbo.recuento_ciclico_config WITH (HOLDLOCK) AS t
          USING (
            SELECT
              @art AS id_articulo,
              @dep AS id_deposito
          ) AS s
          ON t.id_articulo=s.id_articulo
            AND t.id_deposito=s.id_deposito
          WHEN MATCHED THEN
            UPDATE SET
              id_categoria=@cat,
              proximo_recuento=@prox,
              actualizado_en=SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (
              id_articulo,
              id_deposito,
              id_categoria,
              proximo_recuento
            )
            VALUES (
              @art,
              @dep,
              @cat,
              @prox
            );
        `);

      guardados += 1;
    }

    await trans.commit();

    return res.json({
      ok: true,
      guardados,
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("recuentoCiclico.guardarBase:", err);

    return res.status(500).json({
      error: "No se pudo guardar la configuración",
      detalle: err.message,
    });
  }
};

exports.programarBase = async (req, res) => {
  const fechaInicio = parseYmd(req.body?.fecha_inicio);
  const depositos = normalizarIds(req.body?.depositos);

  if (!fechaInicio) {
    return res.status(400).json({
      error: "Fecha inicial inválida",
    });
  }

  let trans;

  try {
    await poolConnect;

    trans = new sql.Transaction(await getPool());

    await trans.begin();

    const rq = new sql.Request(trans);
    const lista = agregarListaEnteros(rq, "dep", depositos);

    const r = await rq.query(`
      SELECT
        rc.id_config,
        rc.id_articulo,
        rc.id_deposito,
        cat.id_categoria,
        cat.codigo AS categoria,
        cat.dias,
        a.cod_articulo AS codigo_articulo,
        d.nombre AS deposito
      FROM dbo.recuento_ciclico_config rc WITH (UPDLOCK,HOLDLOCK)
      INNER JOIN dbo.recuento_ciclico_categorias cat WITH (NOLOCK)
        ON cat.id_categoria=rc.id_categoria
      INNER JOIN dbo.articulos a WITH (NOLOCK)
        ON a.id_articulo=rc.id_articulo
      INNER JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito=rc.id_deposito
      WHERE rc.id_categoria IS NOT NULL
        AND ISNULL(cat.activo,1)=1
        ${lista.ids.length ? `AND rc.id_deposito IN (${lista.sql})` : ""}
      ORDER BY
        cat.codigo,
        a.cod_articulo,
        d.nombre;
    `);

    const grupos = new Map();

    for (const row of r.recordset || []) {
      const key = `${row.id_categoria}|${row.dias}`;

      if (!grupos.has(key)) grupos.set(key, []);

      grupos.get(key).push(row);
    }

    let actualizados = 0;

    for (const filas of grupos.values()) {
      if (!filas.length) continue;

      const frecuencia = Math.max(1, Number(filas[0].dias));
      const cantidadPorDia = Math.max(1, Math.ceil(filas.length / frecuencia));
      let fecha = siguienteDiaHabil(new Date(fechaInicio.getTime()));
      let usadosEnDia = 0;

      for (const row of filas) {
        await new sql.Request(trans)
          .input("id", sql.BigInt, Number(row.id_config))
          .input("f", sql.Date, ymdLocal(fecha))
          .query(`
            UPDATE dbo.recuento_ciclico_config
            SET
              proximo_recuento=@f,
              actualizado_en=SYSDATETIME()
            WHERE id_config=@id;
          `);

        actualizados += 1;
        usadosEnDia += 1;

        if (usadosEnDia >= cantidadPorDia) {
          fecha.setDate(fecha.getDate() + 1);
          fecha = siguienteDiaHabil(fecha);
          usadosEnDia = 0;
        }
      }
    }

    await trans.commit();

    return res.json({
      ok: true,
      actualizados,
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("recuentoCiclico.programarBase:", err);

    return res.status(500).json({
      error: "No se pudieron reasignar las fechas",
      detalle: err.message,
    });
  }
};

exports.generarConteo = async (req, res) => {
  const desde = parseYmd(req.body?.fecha_desde);
  const hasta = parseYmd(req.body?.fecha_hasta);
  const depositos = normalizarIds(req.body?.depositos);

  if (!desde || !hasta || hasta < desde) {
    return res.status(400).json({
      error: "Rango de fechas inválido",
    });
  }

  let trans;

  try {
    await poolConnect;

    trans = new sql.Transaction(await getPool());

    await trans.begin();

    const rq = new sql.Request(trans)
      .input("desde", sql.Date, ymdLocal(desde))
      .input("hasta", sql.Date, ymdLocal(hasta));

    const lista = agregarListaEnteros(rq, "dep", depositos);

    const base = await rq.query(`
      SELECT
        rc.id_articulo,
        a.cod_articulo AS codigo,
        a.descripcion,
        rc.id_deposito,
        d.nombre AS deposito,
        CAST(SUM(ISNULL(s.cantidad,0)) AS DECIMAL(18,4)) AS stock_teorico
      FROM dbo.recuento_ciclico_config rc WITH (NOLOCK)
      INNER JOIN dbo.recuento_ciclico_categorias cat WITH (NOLOCK)
        ON cat.id_categoria=rc.id_categoria
      INNER JOIN dbo.articulos a WITH (NOLOCK)
        ON a.id_articulo=rc.id_articulo
      INNER JOIN dbo.stock s WITH (NOLOCK)
        ON s.id_articulo=rc.id_articulo
        AND s.id_deposito=rc.id_deposito
      INNER JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito=rc.id_deposito
      WHERE rc.proximo_recuento BETWEEN @desde AND @hasta
        AND ISNULL(cat.activo,1)=1
        ${lista.ids.length ? `AND rc.id_deposito IN (${lista.sql})` : ""}
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.recuento_ciclico_detalles pd WITH (NOLOCK)
          INNER JOIN dbo.recuento_ciclico_sesiones ps WITH (NOLOCK)
            ON ps.id_recuento=pd.id_recuento
          WHERE pd.id_articulo=rc.id_articulo
            AND pd.id_deposito=rc.id_deposito
            AND pd.confirmado_en IS NULL
            AND ps.estado IN ('ABIERTO','PARCIAL')
        )
      GROUP BY
        rc.id_articulo,
        a.cod_articulo,
        a.descripcion,
        rc.id_deposito,
        d.nombre
      ORDER BY
        a.cod_articulo,
        d.nombre;
    `);

    if (!base.recordset.length) {
      await trans.rollback();

      return res.status(404).json({
        error: "No hay artículos programados para ese rango o filtro",
      });
    }

    const usuario = getUsuario(req);

    const cab = await new sql.Request(trans)
      .input("desde", sql.Date, ymdLocal(desde))
      .input("hasta", sql.Date, ymdLocal(hasta))
      .input("filtro", sql.NVarChar(sql.MAX), depositos.length ? depositos.join(",") : null)
      .input("usr", sql.NVarChar(150), usuario)
      .query(`
        INSERT INTO dbo.recuento_ciclico_sesiones (
          fecha_desde,
          fecha_hasta,
          depositos_filtro,
          estado,
          creado_por
        )
        OUTPUT INSERTED.id_recuento
        VALUES (
          @desde,
          @hasta,
          @filtro,
          'ABIERTO',
          @usr
        );
      `);

    const idRecuento = Number(cab.recordset[0].id_recuento);

    for (const row of base.recordset) {
      await new sql.Request(trans)
        .input("rec", sql.BigInt, idRecuento)
        .input("art", sql.Int, Number(row.id_articulo))
        .input("dep", sql.Int, Number(row.id_deposito))
        .input("stock", sql.Decimal(18, 4), Number(row.stock_teorico || 0))
        .query(`
          INSERT INTO dbo.recuento_ciclico_detalles (
            id_recuento,
            id_articulo,
            id_deposito,
            stock_teorico
          )
          VALUES (
            @rec,
            @art,
            @dep,
            @stock
          );
        `);
    }

    await trans.commit();

    return res.status(201).json({
      ok: true,
      id_recuento: idRecuento,
      filas: base.recordset.length,
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("recuentoCiclico.generarConteo:", err);

    return res.status(500).json({
      error: "No se pudo generar el recuento",
      detalle: err.message,
    });
  }
};

exports.getSesiones = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const incluirCerradas = String(req.query?.todas || "") === "1";

    const r = await pool.request().query(`
      SELECT TOP 100
        s.*,
        COUNT(d.id_detalle) AS filas,
        SUM(
          CASE
            WHEN d.confirmado_en IS NULL THEN 1
            ELSE 0
          END
        ) AS pendientes
      FROM dbo.recuento_ciclico_sesiones s WITH (NOLOCK)
      LEFT JOIN dbo.recuento_ciclico_detalles d WITH (NOLOCK)
        ON d.id_recuento=s.id_recuento
      ${incluirCerradas ? "" : "WHERE s.estado IN ('ABIERTO','PARCIAL')"}
      GROUP BY
        s.id_recuento,
        s.fecha_desde,
        s.fecha_hasta,
        s.depositos_filtro,
        s.estado,
        s.creado_en,
        s.creado_por,
        s.confirmado_en,
        s.confirmado_por
      ORDER BY
        s.creado_en DESC,
        s.id_recuento DESC;
    `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("recuentoCiclico.getSesiones:", err);

    return res.status(500).json({
      error: "No se pudieron listar los recuentos",
      detalle: err.message,
    });
  }
};

exports.getSesion = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Recuento inválido",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();

    const cab = await pool.request()
      .input("id", sql.BigInt, id)
      .query(`
        SELECT *
        FROM dbo.recuento_ciclico_sesiones WITH (NOLOCK)
        WHERE id_recuento=@id;
      `);

    if (!cab.recordset.length) {
      return res.status(404).json({
        error: "Recuento no encontrado",
      });
    }

    const det = await pool.request()
      .input("id", sql.BigInt, id)
      .query(`
        SELECT
          d.id_detalle,
          d.id_recuento,
          d.id_articulo,
          a.cod_articulo AS codigo,
          a.descripcion,
          d.id_deposito,
          dep.nombre AS deposito,
          d.stock_teorico,
          d.stock_actual_confirmacion,
          d.cantidad_contada,
          d.diferencia_recuento,
          d.ajuste_aplicado,
          d.motivo,
          d.observaciones,
          d.confirmado_en,
          d.confirmado_por,
          d.numero_ajuste
        FROM dbo.recuento_ciclico_detalles d WITH (NOLOCK)
        INNER JOIN dbo.articulos a WITH (NOLOCK)
          ON a.id_articulo=d.id_articulo
        INNER JOIN dbo.depositos dep WITH (NOLOCK)
          ON dep.id_deposito=d.id_deposito
        WHERE d.id_recuento=@id
        ORDER BY
          a.cod_articulo,
          dep.nombre;
      `);

    return res.json({
      cabecera: cab.recordset[0],
      detalle: det.recordset || [],
    });
  } catch (err) {
    console.error("recuentoCiclico.getSesion:", err);

    return res.status(500).json({
      error: "No se pudo abrir el recuento",
      detalle: err.message,
    });
  }
};

exports.confirmarConteo = async (req, res) => {
  const idRecuento = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isInteger(idRecuento) || idRecuento <= 0) {
    return res.status(400).json({
      error: "Recuento inválido",
    });
  }

  if (!items.length) {
    return res.status(400).json({
      error: "No hay filas cargadas para confirmar",
    });
  }

  const usuario = getUsuario(req);
  const usuarioId = getUsuarioId(req);

  let trans;

  try {
    await poolConnect;

    trans = new sql.Transaction(await getPool());

    await trans.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const sesion = await new sql.Request(trans)
      .input("id", sql.BigInt, idRecuento)
      .query(`
        SELECT *
        FROM dbo.recuento_ciclico_sesiones WITH (UPDLOCK,HOLDLOCK)
        WHERE id_recuento=@id;
      `);

    if (!sesion.recordset.length) {
      throw new Error("Recuento inexistente");
    }

    if (["CONFIRMADO", "ANULADO"].includes(sesion.recordset[0].estado)) {
      throw new Error(`El recuento ya está ${sesion.recordset[0].estado.toLowerCase()}.`);
    }

    const ajustesPorDeposito = new Map();
    const paresProcesados = new Map();

    let procesados = 0;
    let conAjuste = 0;

    for (const item of items) {
      const idDetalle = Number(item.id_detalle);
      const contado = numero(item.cantidad_contada);

      if (
        !Number.isInteger(idDetalle) ||
        idDetalle <= 0 ||
        !Number.isFinite(contado) ||
        contado < 0
      ) {
        throw new Error("Hay una fila con cantidad contada inválida.");
      }

      const det = await new sql.Request(trans)
        .input("det", sql.BigInt, idDetalle)
        .input("rec", sql.BigInt, idRecuento)
        .query(`
          SELECT
            d.*,
            a.cod_articulo AS codigo,
            a.descripcion,
            dep.nombre AS deposito
          FROM dbo.recuento_ciclico_detalles d WITH (UPDLOCK,HOLDLOCK)
          INNER JOIN dbo.articulos a
            ON a.id_articulo=d.id_articulo
          INNER JOIN dbo.depositos dep
            ON dep.id_deposito=d.id_deposito
          WHERE d.id_detalle=@det
            AND d.id_recuento=@rec;
        `);

      if (!det.recordset.length) {
        throw new Error(`Detalle ${idDetalle} no pertenece al recuento.`);
      }

      const row = det.recordset[0];

      if (row.confirmado_en) {
        throw new Error(`El detalle ${idDetalle} ya fue confirmado.`);
      }

      const stockTeorico = Number(row.stock_teorico || 0);

      const stockActual = await stockActualDeposito(
        trans,
        Number(row.id_articulo),
        Number(row.id_deposito),
      );

      const diferenciaRecuento = contado - stockTeorico;
      const ajusteAplicado = contado - stockActual;
      const motivo = texto(item.motivo) || null;
      const observaciones = texto(item.observaciones) || null;

      if (Math.abs(diferenciaRecuento) > 0.0000001 && !motivo) {
        throw new Error(`Debe indicar un motivo para el artículo ${row.codigo}.`);
      }

      let numeroAjuste = null;

      if (Math.abs(ajusteAplicado) > 0.0000001) {
        const depId = Number(row.id_deposito);

        if (!ajustesPorDeposito.has(depId)) {
          const nro = await crearCabeceraAjuste(trans, {
            depositoNombre: row.deposito,
            motivo: `RECUENTO CÍCLICO #${idRecuento}`,
            usuarioId,
          });

          ajustesPorDeposito.set(depId, nro);
        }

        numeroAjuste = ajustesPorDeposito.get(depId);

        await insertarDetalleAjuste(trans, {
          numeroAjuste,
          codigo: row.codigo,
          descripcion: row.descripcion,
          delta: ajusteAplicado,
        });

        await aplicarDeltaStockDeposito(
          trans,
          Number(row.id_articulo),
          Number(row.id_deposito),
          ajusteAplicado,
        );

        conAjuste += 1;
      }

      await new sql.Request(trans)
        .input("det", sql.BigInt, idDetalle)
        .input("actual", sql.Decimal(18, 4), stockActual)
        .input("contado", sql.Decimal(18, 4), contado)
        .input("dif", sql.Decimal(18, 4), diferenciaRecuento)
        .input("apl", sql.Decimal(18, 4), ajusteAplicado)
        .input("mot", sql.NVarChar(250), motivo)
        .input("obs", sql.NVarChar(1000), observaciones)
        .input("usr", sql.NVarChar(150), usuario)
        .input("aj", sql.Int, numeroAjuste)
        .query(`
          UPDATE dbo.recuento_ciclico_detalles
          SET
            stock_actual_confirmacion=@actual,
            cantidad_contada=@contado,
            diferencia_recuento=@dif,
            ajuste_aplicado=@apl,
            motivo=@mot,
            observaciones=@obs,
            confirmado_en=SYSDATETIME(),
            confirmado_por=@usr,
            numero_ajuste=@aj
          WHERE id_detalle=@det;
        `);

      await new sql.Request(trans)
        .input("det", sql.BigInt, idDetalle)
        .input("rec", sql.BigInt, idRecuento)
        .input("art", sql.Int, Number(row.id_articulo))
        .input("dep", sql.Int, Number(row.id_deposito))
        .input("teo", sql.Decimal(18, 4), stockTeorico)
        .input("actual", sql.Decimal(18, 4), stockActual)
        .input("contado", sql.Decimal(18, 4), contado)
        .input("dif", sql.Decimal(18, 4), diferenciaRecuento)
        .input("apl", sql.Decimal(18, 4), ajusteAplicado)
        .input("usr", sql.NVarChar(150), usuario)
        .input("mot", sql.NVarChar(250), motivo)
        .input("obs", sql.NVarChar(1000), observaciones)
        .input("aj", sql.Int, numeroAjuste)
        .query(`
          INSERT INTO dbo.recuento_ciclico_transacciones (
            id_detalle,
            id_recuento,
            id_articulo,
            id_deposito,
            stock_teorico,
            stock_actual_confirmacion,
            cantidad_contada,
            diferencia_recuento,
            ajuste_aplicado,
            usuario,
            motivo,
            observaciones,
            numero_ajuste
          )
          VALUES (
            @det,
            @rec,
            @art,
            @dep,
            @teo,
            @actual,
            @contado,
            @dif,
            @apl,
            @usr,
            @mot,
            @obs,
            @aj
          );
        `);

      paresProcesados.set(
        `${row.id_articulo}|${row.id_deposito}`,
        {
          idArticulo: Number(row.id_articulo),
          idDeposito: Number(row.id_deposito),
        },
      );

      procesados += 1;
    }

    for (const par of paresProcesados.values()) {
      const cfg = await new sql.Request(trans)
        .input("art", sql.Int, par.idArticulo)
        .input("dep", sql.Int, par.idDeposito)
        .query(`
          SELECT
            rc.id_config,
            cat.dias
          FROM dbo.recuento_ciclico_config rc WITH (UPDLOCK,HOLDLOCK)
          LEFT JOIN dbo.recuento_ciclico_categorias cat
            ON cat.id_categoria=rc.id_categoria
          WHERE rc.id_articulo=@art
            AND rc.id_deposito=@dep;
        `);

      if (!cfg.recordset.length) continue;

      const dias = Number(cfg.recordset[0].dias || 0);
      const proxima = dias > 0 ? proximaFechaDesde(new Date(), dias) : null;

      await new sql.Request(trans)
        .input("art", sql.Int, par.idArticulo)
        .input("dep", sql.Int, par.idDeposito)
        .input("prox", sql.Date, proxima ? ymdLocal(proxima) : null)
        .query(`
          UPDATE dbo.recuento_ciclico_config
          SET
            ultimo_recuento=SYSDATETIME(),
            proximo_recuento=@prox,
            actualizado_en=SYSDATETIME()
          WHERE id_articulo=@art
            AND id_deposito=@dep;
        `);
    }

    const pendSesion = await new sql.Request(trans)
      .input("rec", sql.BigInt, idRecuento)
      .query(`
        SELECT COUNT(*) AS pendientes
        FROM dbo.recuento_ciclico_detalles
        WHERE id_recuento=@rec
          AND confirmado_en IS NULL;
      `);

    const quedan = Number(pendSesion.recordset[0].pendientes);
    const estado = quedan === 0 ? "CONFIRMADO" : "PARCIAL";

    await new sql.Request(trans)
      .input("rec", sql.BigInt, idRecuento)
      .input("usr", sql.NVarChar(150), usuario)
      .input("estado", sql.VarChar(20), estado)
      .query(`
        UPDATE dbo.recuento_ciclico_sesiones
        SET
          estado=@estado,
          confirmado_en=
            CASE
              WHEN @estado='CONFIRMADO' THEN SYSDATETIME()
              ELSE confirmado_en
            END,
          confirmado_por=
            CASE
              WHEN @estado='CONFIRMADO' THEN @usr
              ELSE confirmado_por
            END
        WHERE id_recuento=@rec;
      `);

    await trans.commit();

    return res.json({
      ok: true,
      procesados,
      con_ajuste: conAjuste,
      pendientes: quedan,
      estado,
      ajustes: Object.fromEntries(ajustesPorDeposito),
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("recuentoCiclico.confirmarConteo:", err);

    return res.status(400).json({
      error: "No se pudo confirmar el recuento",
      detalle: err.message,
    });
  }
};

exports.getTransacciones = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();
    const desde = parseYmd(req.query?.desde);
    const hasta = parseYmd(req.query?.hasta);
    const codigo = upper(req.query?.codigo);
    const deposito = entero(req.query?.deposito_id);
    const rq = pool.request();
    const filtros = [];

    if (desde) {
      rq.input("desde", sql.Date, ymdLocal(desde));
      filtros.push("CAST(t.fecha AS date)>=@desde");
    }

    if (hasta) {
      rq.input("hasta", sql.Date, ymdLocal(hasta));
      filtros.push("CAST(t.fecha AS date)<=@hasta");
    }

    if (codigo) {
      rq.input("codigo", sql.NVarChar(100), `%${codigo}%`);
      filtros.push("UPPER(a.cod_articulo) LIKE @codigo");
    }

    if (Number.isInteger(deposito) && deposito > 0) {
      rq.input("dep", sql.Int, deposito);
      filtros.push("t.id_deposito=@dep");
    }

    const r = await rq.query(`
      SELECT TOP 5000
        t.id_transaccion,
        t.fecha,
        t.id_recuento,
        a.cod_articulo AS codigo,
        a.descripcion,
        d.nombre AS deposito,
        t.stock_teorico,
        t.stock_actual_confirmacion,
        t.cantidad_contada,
        t.diferencia_recuento,
        t.ajuste_aplicado,
        t.usuario,
        t.motivo,
        t.observaciones,
        t.numero_ajuste
      FROM dbo.recuento_ciclico_transacciones t WITH (NOLOCK)
      INNER JOIN dbo.articulos a WITH (NOLOCK)
        ON a.id_articulo=t.id_articulo
      INNER JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito=t.id_deposito
      ${filtros.length ? `WHERE ${filtros.join(" AND ")}` : ""}
      ORDER BY
        t.fecha DESC,
        t.id_transaccion DESC;
    `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("recuentoCiclico.getTransacciones:", err);

    return res.status(500).json({
      error: "No se pudo obtener el historial",
      detalle: err.message,
    });
  }
};

exports.getKaizen = async (req, res) => {
  try {
    const desde = parseYmd(req.query?.desde);
    const hasta = parseYmd(req.query?.hasta);
    const depositoId = entero(req.query?.deposito_id);

    if (!desde || !hasta) {
      return res.status(400).json({
        error: "Debe indicar fecha desde y fecha hasta.",
      });
    }

    if (hasta < desde) {
      return res.status(400).json({
        error: "El rango de fechas es inválido.",
      });
    }

    if (Math.ceil((hasta.getTime() - desde.getTime()) / 86400000) > 62) {
      return res.status(400).json({
        error: "El período máximo permitido para Kaizen es de 63 días.",
      });
    }

    await poolConnect;

    const pool = await getPool();

    const rq = pool.request()
      .input("desde", sql.Date, ymdLocal(desde))
      .input("hasta", sql.Date, ymdLocal(hasta));

    let filtro = "";

    if (Number.isInteger(depositoId) && depositoId > 0) {
      rq.input("dep", sql.Int, depositoId);

      filtro = "AND id_deposito=@dep";
    }

    const transacciones = await rq.query(`
      SELECT
        CONVERT(varchar(10),CAST(fecha AS date),23) AS fecha_ymd,
        diferencia_recuento,
        motivo
      FROM dbo.recuento_ciclico_transacciones WITH (NOLOCK)
      WHERE fecha>=@desde
        AND fecha<DATEADD(day,1,@hasta)
        ${filtro}
      ORDER BY fecha;
    `);

    const catalogoResult = await pool.request().query(`
      SELECT
        id_motivo,
        codigo,
        descripcion,
        orden
      FROM dbo.recuento_ciclico_motivos WITH (NOLOCK)
      WHERE activo=1
      ORDER BY
        CASE WHEN orden IS NULL THEN 1 ELSE 0 END,
        orden,
        codigo;
    `);

    const dias = [];
    const diasMap = new Map();
    const cursor = new Date(desde.getTime());

    while (cursor <= hasta) {
      const fecha = ymdLocal(cursor);

      const item = {
        fecha,
        dia: cursor.getDate(),
        recuentos: 0,
        diferencias: 0,
        eficiencia: null,
      };

      dias.push(item);

      diasMap.set(fecha, item);

      cursor.setDate(cursor.getDate() + 1);
    }

    const motivosMap = new Map();
    const motivosCodigo = new Map();

    for (const m of catalogoResult.recordset || []) {
      const motivo = {
        key: Number(m.id_motivo),
        id_motivo: Number(m.id_motivo),
        codigo: String(m.codigo || ""),
        descripcion: String(m.descripcion || ""),
        orden: m.orden == null ? null : Number(m.orden),
        total: 0,
        dias: {},
      };

      motivosMap.set(motivo.id_motivo, motivo);

      motivosCodigo.set(upper(motivo.codigo), motivo);
    }

    let totalRecuentos = 0;
    let totalDiferencias = 0;
    let diferenciasSinMotivo = 0;

    for (const t of transacciones.recordset || []) {
      const fecha = String(t.fecha_ymd || "");
      const dia = diasMap.get(fecha);

      if (!dia) continue;

      totalRecuentos += 1;
      dia.recuentos += 1;

      const hayDiferencia =
        Math.abs(Number(t.diferencia_recuento || 0)) > 0.0000001;

      if (!hayDiferencia) continue;

      totalDiferencias += 1;
      dia.diferencias += 1;

      const codigoMotivo = upper(t.motivo);

      if (!codigoMotivo) {
        diferenciasSinMotivo += 1;
        continue;
      }

      const motivo = motivosCodigo.get(codigoMotivo);

      if (motivo) {
        motivo.total += 1;

        motivo.dias[fecha] =
          Number(motivo.dias[fecha] || 0) + 1;
      }
    }

    for (const d of dias) {
      d.eficiencia =
        d.recuentos > 0
          ? ((d.recuentos - d.diferencias) / d.recuentos) * 100
          : null;
    }

    const motivos = Array.from(motivosMap.values())
      .map((m) => ({
        ...m,
        porcentaje:
          totalRecuentos > 0
            ? (m.total / totalRecuentos) * 100
            : 0,
      }))
      .sort((a, b) => {
        const oa = a.orden ?? Number.MAX_SAFE_INTEGER;
        const ob = b.orden ?? Number.MAX_SAFE_INTEGER;

        return oa !== ob
          ? oa - ob
          : String(a.codigo).localeCompare(
              String(b.codigo),
              "es",
              {
                numeric: true,
                sensitivity: "base",
              },
            );
      });

    const totalMotivos = motivos.reduce(
      (acc, m) => acc + Number(m.total || 0),
      0,
    );

    const eficiencia =
      totalRecuentos > 0
        ? ((totalRecuentos - totalDiferencias) / totalRecuentos) * 100
        : null;

    return res.json({
      desde: ymdLocal(desde),
      hasta: ymdLocal(hasta),
      deposito_id:
        Number.isInteger(depositoId) && depositoId > 0
          ? depositoId
          : null,
      resumen: {
        recuentos: totalRecuentos,
        diferencias: totalDiferencias,
        correctos: totalRecuentos - totalDiferencias,
        eficiencia,
        motivos_informados: totalMotivos,
        diferencias_sin_motivo: diferenciasSinMotivo,
      },
      dias,
      motivos,
    });
  } catch (err) {
    console.error("recuentoCiclico.getKaizen:", err);

    return res.status(500).json({
      error: "No se pudo generar el informe Kaizen.",
      detalle: err.message,
    });
  }
};

exports.getMotivosRecuento = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();
    const todas = String(req.query?.todas || "") === "1";

    const result = await pool.request().query(`
      SELECT
        id_motivo,
        codigo,
        descripcion,
        orden,
        activo,
        creado_en,
        actualizado_en
      FROM dbo.recuento_ciclico_motivos WITH (NOLOCK)
      ${todas ? "" : "WHERE activo=1"}
      ORDER BY
        CASE WHEN orden IS NULL THEN 1 ELSE 0 END,
        orden,
        codigo;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("recuentoCiclico.getMotivosRecuento:", err);

    return res.status(500).json({
      error: "No se pudieron obtener los motivos",
      detalle: err.message,
    });
  }
};

exports.crearMotivoRecuento = async (req, res) => {
  try {
    const codigo = upper(req.body?.codigo);
    const descripcion = texto(req.body?.descripcion);
    const ordenRaw = req.body?.orden;

    const orden =
      ordenRaw === "" ||
      ordenRaw === null ||
      ordenRaw === undefined
        ? null
        : entero(ordenRaw);

    if (!codigo) {
      return res.status(400).json({
        error: "Debe indicar el código del motivo",
      });
    }

    if (!descripcion) {
      return res.status(400).json({
        error: "Debe indicar la descripción del motivo",
      });
    }

    if (
      orden !== null &&
      (!Number.isInteger(orden) || orden <= 0)
    ) {
      return res.status(400).json({
        error: "Orden inválido",
      });
    }

    await poolConnect;

    const pool = await getPool();

    const existe = await pool.request()
      .input("codigo", sql.NVarChar(100), codigo)
      .query(`
        SELECT TOP 1 id_motivo
        FROM dbo.recuento_ciclico_motivos
        WHERE UPPER(LTRIM(RTRIM(codigo)))=
              UPPER(LTRIM(RTRIM(@codigo)));
      `);

    if (existe.recordset.length) {
      return res.status(409).json({
        error: "Ya existe un motivo con ese código",
      });
    }

    const result = await pool.request()
      .input("codigo", sql.NVarChar(100), codigo)
      .input("descripcion", sql.NVarChar(250), descripcion)
      .input("orden", sql.Int, orden)
      .query(`
        INSERT INTO dbo.recuento_ciclico_motivos (
          codigo,
          descripcion,
          orden,
          activo
        )
        OUTPUT
          INSERTED.id_motivo,
          INSERTED.codigo,
          INSERTED.descripcion,
          INSERTED.orden,
          INSERTED.activo
        VALUES (
          @codigo,
          @descripcion,
          @orden,
          1
        );
      `);

    return res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error("recuentoCiclico.crearMotivoRecuento:", err);

    return res.status(500).json({
      error: "No se pudo crear el motivo",
      detalle: err.message,
    });
  }
};

exports.editarMotivoRecuento = async (req, res) => {
  const id = entero(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Motivo inválido",
    });
  }

  const codigo = upper(req.body?.codigo);
  const descripcion = texto(req.body?.descripcion);
  const ordenRaw = req.body?.orden;

  const orden =
    ordenRaw === "" ||
    ordenRaw === null ||
    ordenRaw === undefined
      ? null
      : entero(ordenRaw);

  const activo =
    req.body?.activo === false ||
    req.body?.activo === 0 ||
    req.body?.activo === "0"
      ? 0
      : 1;

  if (!codigo || !descripcion) {
    return res.status(400).json({
      error: "Código y descripción son obligatorios",
    });
  }

  if (
    orden !== null &&
    (!Number.isInteger(orden) || orden <= 0)
  ) {
    return res.status(400).json({
      error: "Orden inválido",
    });
  }

  let trans;

  try {
    await poolConnect;

    trans = new sql.Transaction(await getPool());

    await trans.begin();

    const actual = await new sql.Request(trans)
      .input("id", sql.Int, id)
      .query(`
        SELECT
          id_motivo,
          codigo
        FROM dbo.recuento_ciclico_motivos WITH (UPDLOCK,HOLDLOCK)
        WHERE id_motivo=@id;
      `);

    if (!actual.recordset.length) {
      throw new Error("El motivo no existe");
    }

    const codigoAnterior = texto(actual.recordset[0].codigo);

    const duplicado = await new sql.Request(trans)
      .input("id", sql.Int, id)
      .input("codigo", sql.NVarChar(100), codigo)
      .query(`
        SELECT TOP 1 id_motivo
        FROM dbo.recuento_ciclico_motivos
        WHERE id_motivo<>@id
          AND UPPER(LTRIM(RTRIM(codigo)))=
              UPPER(LTRIM(RTRIM(@codigo)));
      `);

    if (duplicado.recordset.length) {
      throw new Error("Ya existe otro motivo con ese código");
    }

    await new sql.Request(trans)
      .input("id", sql.Int, id)
      .input("codigo", sql.NVarChar(100), codigo)
      .input("descripcion", sql.NVarChar(250), descripcion)
      .input("orden", sql.Int, orden)
      .input("activo", sql.Bit, activo)
      .query(`
        UPDATE dbo.recuento_ciclico_motivos
        SET
          codigo=@codigo,
          descripcion=@descripcion,
          orden=@orden,
          activo=@activo,
          actualizado_en=SYSDATETIME()
        WHERE id_motivo=@id;
      `);

    if (upper(codigoAnterior) !== codigo) {
      await new sql.Request(trans)
        .input("viejo", sql.NVarChar(250), codigoAnterior)
        .input("nuevo", sql.NVarChar(250), codigo)
        .query(`
          UPDATE dbo.recuento_ciclico_detalles
          SET motivo=@nuevo
          WHERE UPPER(LTRIM(RTRIM(ISNULL(motivo,''))))=
                UPPER(LTRIM(RTRIM(@viejo)));

          UPDATE dbo.recuento_ciclico_transacciones
          SET motivo=@nuevo
          WHERE UPPER(LTRIM(RTRIM(ISNULL(motivo,''))))=
                UPPER(LTRIM(RTRIM(@viejo)));
        `);
    }

    await trans.commit();

    return res.json({
      ok: true,
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    console.error("recuentoCiclico.editarMotivoRecuento:", err);

    return res.status(400).json({
      error: "No se pudo editar el motivo",
      detalle: err.message,
    });
  }
};

exports.eliminarMotivoRecuento = async (req, res) => {
  try {
    const id = entero(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Motivo inválido",
      });
    }

    await poolConnect;

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.recuento_ciclico_motivos
        SET
          activo=0,
          actualizado_en=SYSDATETIME()
        WHERE id_motivo=@id;

        SELECT @@ROWCOUNT AS afectados;
      `);

    if (!Number(result.recordset?.[0]?.afectados || 0)) {
      return res.status(404).json({
        error: "Motivo no encontrado",
      });
    }

    return res.json({
      ok: true,
    });
  } catch (err) {
    console.error("recuentoCiclico.eliminarMotivoRecuento:", err);

    return res.status(500).json({
      error: "No se pudo eliminar el motivo",
      detalle: err.message,
    });
  }
};
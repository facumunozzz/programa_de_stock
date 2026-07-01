// backend/controllers/produccion.js
const { sql, poolConnect, getPool } = require("../db");

const toDb = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const up = (value) => {
  const normalized = toDb(value);
  return normalized ? normalized.toUpperCase() : null;
};

const normalizarItems = (itemsRaw) => {
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];

  const itemsValidos = items
    .map((item) => ({
      codBarra: up(item?.cod_barra),
      cantidad: Number(item?.cantidad),
    }))
    .filter(
      (item) =>
        item.codBarra && Number.isFinite(item.cantidad) && item.cantidad > 0,
    );

  const agrupados = new Map();

  for (const item of itemsValidos) {
    agrupados.set(
      item.codBarra,
      (agrupados.get(item.codBarra) || 0) + item.cantidad,
    );
  }

  return Array.from(agrupados.entries()).map(([codBarra, cantidad]) => ({
    codBarra,
    cantidad,
  }));
};

exports.createFormula = async (req, res) => {
  const codBarraProducto = up(req.body?.cod_barra);

  const itemsMerged = normalizarItems(req.body?.items);

  if (!codBarraProducto) {
    return res.status(400).json({
      error: "Debe indicar el código de barras del producto",
    });
  }

  if (!itemsMerged.length) {
    return res.status(400).json({
      error: "Debe incluir al menos un material válido",
    });
  }

  const tieneAutorreferencia = itemsMerged.some(
    (item) => item.codBarra === codBarraProducto,
  );

  if (tieneAutorreferencia) {
    return res.status(400).json({
      error: "El producto no puede ser material de su propia fórmula",
    });
  }

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const productoRequest = new sql.Request(transaction);

    const productoResult = await productoRequest.input(
      "codBarraProducto",
      sql.VarChar,
      codBarraProducto,
    ).query(`
          SELECT
            id_articulo,
            cod_articulo,
            cod_barra,
            descripcion
          FROM dbo.articulos
          WHERE UPPER(
            LTRIM(RTRIM(cod_barra))
          ) = @codBarraProducto
        `);

    if (!productoResult.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "El código de barras del producto no existe",
      });
    }

    const producto = productoResult.recordset[0];

    const formulaExistenteRequest = new sql.Request(transaction);

    const formulaExistente = await formulaExistenteRequest.input(
      "productoId",
      sql.Int,
      producto.id_articulo,
    ).query(`
          SELECT id
          FROM dbo.produccion_formulas
          WHERE producto_id = @productoId
        `);

    if (formulaExistente.recordset.length) {
      await transaction.rollback();

      return res.status(409).json({
        error: "Ya existe una fórmula para este producto",
      });
    }

    const materialesRequest = new sql.Request(transaction);

    const parametrosMateriales = itemsMerged.map(
      (_, index) => `@material${index}`,
    );

    itemsMerged.forEach((item, index) => {
      materialesRequest.input(`material${index}`, sql.VarChar, item.codBarra);
    });

    const materialesResult = await materialesRequest.query(`
        SELECT
          id_articulo,
          UPPER(
            LTRIM(RTRIM(cod_barra))
          ) AS cod_barra,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(
          LTRIM(RTRIM(cod_barra))
        ) IN (
          ${parametrosMateriales.join(",")}
        )
      `);

    const idByBarra = new Map(
      materialesResult.recordset.map((material) => [
        material.cod_barra,
        material.id_articulo,
      ]),
    );

    const descripcionByBarra = new Map(
      materialesResult.recordset.map((material) => [
        material.cod_barra,
        material.descripcion,
      ]),
    );

    const materialesFaltantes = itemsMerged
      .filter((item) => !idByBarra.has(item.codBarra))
      .map((item) => item.codBarra);

    if (materialesFaltantes.length) {
      await transaction.rollback();

      return res.status(400).json({
        error: "Existen materiales que no fueron encontrados",
        detalle: materialesFaltantes,
      });
    }

    const cabeceraRequest = new sql.Request(transaction);

    const cabeceraResult = await cabeceraRequest.input(
      "productoId",
      sql.Int,
      producto.id_articulo,
    ).query(`
          INSERT INTO dbo.produccion_formulas (
            producto_id
          )
          OUTPUT
            INSERTED.id,
            INSERTED.producto_id,
            INSERTED.fecha_creacion
          VALUES (
            @productoId
          )
        `);

    const formulaId = cabeceraResult.recordset[0].id;

    for (const item of itemsMerged) {
      const detalleRequest = new sql.Request(transaction);

      await detalleRequest
        .input("formulaId", sql.Int, formulaId)
        .input("materialId", sql.Int, idByBarra.get(item.codBarra))
        .input("cantidad", sql.Decimal(18, 4), item.cantidad).query(`
          INSERT INTO dbo.produccion_formula_detalles (
            formula_id,
            material_id,
            cantidad
          )
          VALUES (
            @formulaId,
            @materialId,
            @cantidad
          )
        `);
    }

    await transaction.commit();

    return res.status(201).json({
      message: "Fórmula creada correctamente",
      formula: {
        id: formulaId,
        producto: {
          id_articulo: producto.id_articulo,
          cod_articulo: producto.cod_articulo,
          cod_barra: producto.cod_barra,
          descripcion: producto.descripcion,
        },
        detalle: itemsMerged.map((item) => ({
          cod_barra: item.codBarra,
          descripcion: descripcionByBarra.get(item.codBarra) || "",
          cantidad: item.cantidad,
        })),
      },
    });
  } catch (error) {
    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    console.error("produccion.createFormula:", error);

    return res.status(500).json({
      error: "Error al crear la fórmula",
      detalle: error.message,
    });
  }
};

exports.getFormulaByCodigo = async (req, res) => {
  const codBarraProducto = up(req.params?.codigo);

  if (!codBarraProducto) {
    return res.status(400).json({
      error: "Código de barras inválido",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();

    const productoResult = await pool
      .request()
      .input("codBarraProducto", sql.VarChar, codBarraProducto).query(`
        SELECT
          id_articulo,
          cod_articulo,
          cod_barra,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(
          LTRIM(RTRIM(cod_barra))
        ) = @codBarraProducto
      `);

    if (!productoResult.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado",
      });
    }

    const producto = productoResult.recordset[0];

    const formulaResult = await pool
      .request()
      .input("productoId", sql.Int, producto.id_articulo).query(`
        SELECT
          id,
          fecha_creacion
        FROM dbo.produccion_formulas
        WHERE producto_id = @productoId
      `);

    if (!formulaResult.recordset.length) {
      return res.json({
        producto,
        formula: null,
        detalle: [],
        message: "No existe fórmula para este producto",
      });
    }

    const formula = formulaResult.recordset[0];

    const detalleResult = await pool
      .request()
      .input("formulaId", sql.Int, formula.id).query(`
        SELECT
          d.cantidad,
          a.id_articulo,
          a.cod_articulo,
          a.cod_barra,
          a.descripcion
        FROM dbo.produccion_formula_detalles d
        INNER JOIN dbo.articulos a
          ON a.id_articulo = d.material_id
        WHERE d.formula_id = @formulaId
        ORDER BY
          a.descripcion,
          a.cod_barra
      `);

    return res.json({
      producto,
      formula,
      detalle: detalleResult.recordset,
    });
  } catch (error) {
    console.error("produccion.getFormulaByCodigo:", error);

    return res.status(500).json({
      error: "Error al obtener la fórmula",
      detalle: error.message,
    });
  }
};

exports.getAllFormulas = async (_req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const result = await pool.request().query(`
        SELECT
          f.id,
          f.fecha_creacion,
          a.id_articulo,
          a.cod_articulo,
          a.cod_barra,
          a.descripcion
        FROM dbo.produccion_formulas f
        INNER JOIN dbo.articulos a
          ON a.id_articulo = f.producto_id
        ORDER BY
          a.descripcion,
          a.cod_barra
      `);

    return res.json(result.recordset);
  } catch (error) {
    console.error("produccion.getAllFormulas:", error);

    return res.status(500).json({
      error: "Error al listar fórmulas",
      detalle: error.message,
    });
  }
};

exports.checkProducto = async (req, res) => {
  const codBarraProducto = up(req.params?.codigo);

  if (!codBarraProducto) {
    return res.status(400).json({
      error: "Código de barras inválido",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("codBarraProducto", sql.VarChar, codBarraProducto).query(`
        SELECT
          id_articulo,
          cod_articulo,
          cod_barra,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(
          LTRIM(RTRIM(cod_barra))
        ) = @codBarraProducto
      `);

    if (!result.recordset.length) {
      return res.json({
        exists: false,
      });
    }

    return res.json({
      exists: true,
      articulo: result.recordset[0],
    });
  } catch (error) {
    console.error("produccion.checkProducto:", error);

    return res.status(500).json({
      error: "Error verificando producto",
      detalle: error.message,
    });
  }
};

exports.validateMateriales = async (req, res) => {
  const codigosRaw = Array.isArray(req.body?.codigos) ? req.body.codigos : [];

  const codigos = [...new Set(codigosRaw.map(up).filter(Boolean))];

  if (!codigos.length) {
    return res.status(400).json({
      error: "Debe enviar al menos un código de barras",
    });
  }

  try {
    await poolConnect;

    const pool = await getPool();
    const request = pool.request();

    const parametros = codigos.map((_, index) => `@codigo${index}`);

    codigos.forEach((codigo, index) => {
      request.input(`codigo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(`
      SELECT
        id_articulo,
        cod_articulo,
        UPPER(
          LTRIM(RTRIM(cod_barra))
        ) AS cod_barra,
        descripcion
      FROM dbo.articulos
      WHERE UPPER(
        LTRIM(RTRIM(cod_barra))
      ) IN (
        ${parametros.join(",")}
      )
    `);

    const encontrados = new Map(
      result.recordset.map((articulo) => [articulo.cod_barra, articulo]),
    );

    const validos = codigos
      .filter((codigo) => encontrados.has(codigo))
      .map((codigo) => encontrados.get(codigo));

    const faltantes = codigos.filter((codigo) => !encontrados.has(codigo));

    return res.json({
      validos,
      faltantes,
    });
  } catch (error) {
    console.error("produccion.validateMateriales:", error);

    return res.status(500).json({
      error: "Error validando materiales",
      detalle: error.message,
    });
  }
};

exports.replaceFormula = async (req, res) => {
  const codBarraProducto = up(req.body?.cod_barra);

  const itemsMerged = normalizarItems(req.body?.items);

  if (!codBarraProducto) {
    return res.status(400).json({
      error: "Debe indicar el código de barras del producto",
    });
  }

  if (!itemsMerged.length) {
    return res.status(400).json({
      error: "Debe incluir al menos un material válido",
    });
  }

  const tieneAutorreferencia = itemsMerged.some(
    (item) => item.codBarra === codBarraProducto,
  );

  if (tieneAutorreferencia) {
    return res.status(400).json({
      error: "El producto no puede ser material de su propia fórmula",
    });
  }

  let transaction;

  try {
    await poolConnect;

    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const productoRequest = new sql.Request(transaction);

    const productoResult = await productoRequest.input(
      "codBarraProducto",
      sql.VarChar,
      codBarraProducto,
    ).query(`
          SELECT
            id_articulo,
            cod_articulo,
            cod_barra,
            descripcion
          FROM dbo.articulos
          WHERE UPPER(
            LTRIM(RTRIM(cod_barra))
          ) = @codBarraProducto
        `);

    if (!productoResult.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "El código de barras del producto no existe",
      });
    }

    const producto = productoResult.recordset[0];

    const materialesRequest = new sql.Request(transaction);

    const parametrosMateriales = itemsMerged.map(
      (_, index) => `@material${index}`,
    );

    itemsMerged.forEach((item, index) => {
      materialesRequest.input(`material${index}`, sql.VarChar, item.codBarra);
    });

    const materialesResult = await materialesRequest.query(`
        SELECT
          id_articulo,
          UPPER(
            LTRIM(RTRIM(cod_barra))
          ) AS cod_barra,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(
          LTRIM(RTRIM(cod_barra))
        ) IN (
          ${parametrosMateriales.join(",")}
        )
      `);

    const idByBarra = new Map(
      materialesResult.recordset.map((material) => [
        material.cod_barra,
        material.id_articulo,
      ]),
    );

    const descripcionByBarra = new Map(
      materialesResult.recordset.map((material) => [
        material.cod_barra,
        material.descripcion,
      ]),
    );

    const materialesFaltantes = itemsMerged
      .filter((item) => !idByBarra.has(item.codBarra))
      .map((item) => item.codBarra);

    if (materialesFaltantes.length) {
      await transaction.rollback();

      return res.status(400).json({
        error: "Existen materiales que no fueron encontrados",
        detalle: materialesFaltantes,
      });
    }

    const formulaRequest = new sql.Request(transaction);

    const formulaResult = await formulaRequest.input(
      "productoId",
      sql.Int,
      producto.id_articulo,
    ).query(`
          SELECT id
          FROM dbo.produccion_formulas
          WHERE producto_id = @productoId
        `);

    let formulaId;

    if (formulaResult.recordset.length) {
      formulaId = formulaResult.recordset[0].id;

      const eliminarDetallesRequest = new sql.Request(transaction);

      await eliminarDetallesRequest.input("formulaId", sql.Int, formulaId)
        .query(`
          DELETE
          FROM dbo.produccion_formula_detalles
          WHERE formula_id = @formulaId
        `);
    } else {
      const crearCabeceraRequest = new sql.Request(transaction);

      const crearCabeceraResult = await crearCabeceraRequest.input(
        "productoId",
        sql.Int,
        producto.id_articulo,
      ).query(`
            INSERT INTO dbo.produccion_formulas (
              producto_id
            )
            OUTPUT INSERTED.id
            VALUES (
              @productoId
            )
          `);

      formulaId = crearCabeceraResult.recordset[0].id;
    }

    for (const item of itemsMerged) {
      const detalleRequest = new sql.Request(transaction);

      await detalleRequest
        .input("formulaId", sql.Int, formulaId)
        .input("materialId", sql.Int, idByBarra.get(item.codBarra))
        .input("cantidad", sql.Decimal(18, 4), item.cantidad).query(`
          INSERT INTO dbo.produccion_formula_detalles (
            formula_id,
            material_id,
            cantidad
          )
          VALUES (
            @formulaId,
            @materialId,
            @cantidad
          )
        `);
    }

    await transaction.commit();

    return res.json({
      message: "Fórmula actualizada correctamente",
      formula: {
        id: formulaId,
        producto,
        detalle: itemsMerged.map((item) => ({
          cod_barra: item.codBarra,
          descripcion: descripcionByBarra.get(item.codBarra) || "",
          cantidad: item.cantidad,
        })),
      },
    });
  } catch (error) {
    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    console.error("produccion.replaceFormula:", error);

    return res.status(500).json({
      error: "Error al actualizar la fórmula",
      detalle: error.message,
    });
  }
};

exports.updateFormula = (req, res) => {
  req.body = {
    ...(req.body || {}),
    cod_barra: req.params.codigo,
  };

  return exports.replaceFormula(req, res);
};

exports.deleteFormulaByCodigo = async (req, res) => {
  const codBarraProducto = up(req.params?.codigo);

  if (!codBarraProducto) {
    return res.status(400).json({
      error: "Código de barras inválido",
    });
  }

  let transaction;

  try {
    await poolConnect;

    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const productoRequest = new sql.Request(transaction);

    const productoResult = await productoRequest.input(
      "codBarraProducto",
      sql.VarChar,
      codBarraProducto,
    ).query(`
          SELECT
            id_articulo,
            cod_barra,
            descripcion
          FROM dbo.articulos
          WHERE UPPER(
            LTRIM(RTRIM(cod_barra))
          ) = @codBarraProducto
        `);

    if (!productoResult.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "Artículo no encontrado",
      });
    }

    const producto = productoResult.recordset[0];

    const formulaRequest = new sql.Request(transaction);

    const formulaResult = await formulaRequest.input(
      "productoId",
      sql.Int,
      producto.id_articulo,
    ).query(`
          SELECT id
          FROM dbo.produccion_formulas
          WHERE producto_id = @productoId
        `);

    if (!formulaResult.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "No existe fórmula para este producto",
      });
    }

    const formulaId = formulaResult.recordset[0].id;

    const detallesRequest = new sql.Request(transaction);

    await detallesRequest.input("formulaId", sql.Int, formulaId).query(`
        DELETE
        FROM dbo.produccion_formula_detalles
        WHERE formula_id = @formulaId
      `);

    const cabeceraRequest = new sql.Request(transaction);

    await cabeceraRequest.input("formulaId", sql.Int, formulaId).query(`
        DELETE
        FROM dbo.produccion_formulas
        WHERE id = @formulaId
      `);

    await transaction.commit();

    return res.json({
      message: "Fórmula eliminada correctamente",
      producto: {
        id_articulo: producto.id_articulo,
        cod_barra: producto.cod_barra,
        descripcion: producto.descripcion,
      },
    });
  } catch (error) {
    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    console.error("produccion.deleteFormulaByCodigo:", error);

    return res.status(500).json({
      error: "Error al eliminar la fórmula",
      detalle: error.message,
    });
  }
};

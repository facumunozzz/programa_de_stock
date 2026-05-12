const { sql, poolConnect, getPool } = require("../db");

const toDb = (v) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT id_proveedor, nombre
      FROM dbo.remito_proveedores
      WHERE activo = 1
      ORDER BY nombre
    `);

    res.json(r.recordset);
  } catch (err) {
    console.error("remitoProveedores.getAll:", err);
    res.status(500).json({
      error: "Error al listar proveedores",
      detalle: err.message,
    });
  }
};

exports.create = async (req, res) => {
  const nombre = toDb(req.body?.nombre);

  if (!nombre) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const existe = await pool
      .request()
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT id_proveedor
        FROM dbo.remito_proveedores
        WHERE activo = 1
          AND UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
      `);

    if (existe.recordset.length) {
      return res.status(409).json({ error: "Ya existe un proveedor con ese nombre" });
    }

    const r = await pool
      .request()
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        INSERT INTO dbo.remito_proveedores (nombre)
        OUTPUT INSERTED.id_proveedor, INSERTED.nombre
        VALUES (@nombre)
      `);

    res.status(201).json(r.recordset[0]);
  } catch (err) {
    console.error("remitoProveedores.create:", err);
    res.status(500).json({
      error: "Error al crear proveedor",
      detalle: err.message,
    });
  }
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const nombre = toDb(req.body?.nombre);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }

  if (!nombre) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const existe = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT id_proveedor
        FROM dbo.remito_proveedores
        WHERE activo = 1
          AND id_proveedor <> @id
          AND UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
      `);

    if (existe.recordset.length) {
      return res.status(409).json({ error: "Ya existe otro proveedor con ese nombre" });
    }

    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        UPDATE dbo.remito_proveedores
           SET nombre = @nombre
         WHERE id_proveedor = @id
           AND activo = 1;

        SELECT id_proveedor, nombre
        FROM dbo.remito_proveedores
        WHERE id_proveedor = @id;
      `);

    if (!r.recordset.length) {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    res.json(r.recordset[0]);
  } catch (err) {
    console.error("remitoProveedores.update:", err);
    res.status(500).json({
      error: "Error al editar proveedor",
      detalle: err.message,
    });
  }
};

exports.remove = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.remito_proveedores
           SET activo = 0
         WHERE id_proveedor = @id
      `);

    res.json({ message: "Proveedor eliminado" });
  } catch (err) {
    console.error("remitoProveedores.remove:", err);
    res.status(500).json({
      error: "Error al eliminar proveedor",
      detalle: err.message,
    });
  }
};
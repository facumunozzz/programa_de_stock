const { sql, poolConnect, getPool } = require("../db");

// === Listar todas las clasificaciones ===
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id_clasificacion, nombre, es_obligatoria, activa
      FROM clasificaciones
      ORDER BY nombre
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("clasificaciones.getAll:", err);
    res.status(500).json({ error: "Error al listar clasificaciones" });
  }
};

// ✅ Listar clasificaciones activas (para formularios)
exports.getActivas = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id_clasificacion, nombre, es_obligatoria
      FROM clasificaciones
      WHERE activa = 1
      ORDER BY nombre
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("clasificaciones.getActivas:", err);
    res.status(500).json({ error: "Error al listar clasificaciones activas" });
  }
};

// === Crear una nueva clasificación ===
exports.create = async (req, res) => {
  try {
    const nombre = req.body?.nombre?.trim();
    if (!nombre) return res.status(400).json({ error: "Nombre requerido" });

    await poolConnect;
    const pool = await getPool();
    const result = await pool
      .request()
      .input("nombre", sql.VarChar, nombre)
      .query(`
        INSERT INTO clasificaciones (nombre, es_obligatoria, activa)
        OUTPUT INSERTED.*
        VALUES (@nombre, 0, 1)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error("clasificaciones.create:", err);
    res.status(500).json({ error: "Error al crear clasificación" });
  }
};

// === Cambiar flag de obligatoria o activa ===
exports.updateFlag = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const field = req.body?.field;
    if (!["es_obligatoria", "activa"].includes(field))
      return res.status(400).json({ error: "Campo inválido" });

    await poolConnect;
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`UPDATE clasificaciones SET ${field} = 1 - ${field} WHERE id_clasificacion = @id`);

    res.json({ message: "Actualizado" });
  } catch (err) {
    console.error("clasificaciones.updateFlag:", err);
    res.status(500).json({ error: "Error al actualizar clasificación" });
  }
};

// === Eliminar ===
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await poolConnect;
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM clasificaciones WHERE id_clasificacion = @id");

    res.json({ message: "Eliminado correctamente" });
  } catch (err) {
    console.error("clasificaciones.remove:", err);
    res.status(500).json({ error: "Error al eliminar clasificación" });
  }
};

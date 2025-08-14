// controllers/articulos.js
const { sql, poolConnect, getPool } = require('../db');

// Helper: normaliza strings vacíos a NULL
const toDb = (v) =>
  v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim();

// -----------------------------------------------------------------------------
// LISTAR TODOS
// -----------------------------------------------------------------------------
exports.getAllArticulos = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT 
        id_articulo, cod_articulo, descripcion, cod_modelo, color, talle, 
        cod_barra, tipo, familia, subfamilia, material, iibb_aplica, lista_precios_aplica
      FROM articulos
      ORDER BY id_articulo
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error en getAllArticulos:', err);
    res.status(500).json({ error: 'Error al obtener artículos', detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// OBTENER POR ID
// -----------------------------------------------------------------------------
exports.getArticuloById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    await poolConnect;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          id_articulo, cod_articulo, descripcion, cod_modelo, color, talle, 
          cod_barra, tipo, familia, subfamilia, material, iibb_aplica, lista_precios_aplica
        FROM articulos
        WHERE id_articulo = @id
      `);

    if (!result.recordset.length) return res.status(404).json({ message: 'Artículo no encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error en getArticuloById:', err);
    res.status(500).json({ error: 'Error al obtener artículo por ID', detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// OBTENER POR CÓDIGO (para autocompletar en modal de edición)
// -----------------------------------------------------------------------------
exports.getArticuloByCodigo = async (req, res) => {
  try {
    const cod = String(req.params.cod || '').trim().toUpperCase();
    if (!cod) return res.status(400).json({ error: 'Debe indicar un código de artículo' });

    await poolConnect;
    const pool = await getPool();

    const result = await pool.request()
      .input('cod', sql.VarChar, cod)
      .query(`
        SELECT 
          id_articulo, cod_articulo, descripcion, cod_modelo, color, talle,
          cod_barra, tipo, familia, subfamilia, material, iibb_aplica, lista_precios_aplica
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @cod
      `);

    if (!result.recordset.length) {
      // Estructura neutra para no romper el modal si no hay match
      return res.json({
        id_articulo: null,
        cod_articulo: cod,
        descripcion: null,
        cod_modelo: null, color: null, talle: null, cod_barra: null, tipo: null,
        familia: null, subfamilia: null, material: null, iibb_aplica: null, lista_precios_aplica: null
      });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error en getArticuloByCodigo:', err);
    res.status(500).json({ error: 'Error al buscar artículo por código', detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// CREAR (devuelve el registro creado con su ID real)
// -----------------------------------------------------------------------------
exports.createArticulo = async (req, res) => {
  try {
    let {
      cod_articulo, descripcion, cod_modelo, color, talle,
      cod_barra, tipo, familia, subfamilia, material,
      iibb_aplica, lista_precios_aplica
    } = req.body || {};

    if (!cod_articulo || !descripcion) {
      return res.status(400).json({ error: 'Debe indicar código y descripción' });
    }

    // Normalización
    cod_articulo = String(cod_articulo).trim().toUpperCase();
    descripcion = toDb(descripcion);
    cod_modelo = toDb(cod_modelo);
    color = toDb(color);
    talle = toDb(talle);
    cod_barra = toDb(cod_barra);
    tipo = toDb(tipo);
    familia = toDb(familia);
    subfamilia = toDb(subfamilia);
    material = toDb(material);
    iibb_aplica = toDb(iibb_aplica);
    lista_precios_aplica = toDb(lista_precios_aplica);

    await poolConnect;
    const pool = await getPool();

    // Validación de duplicado por código (case/espacios insensibles)
    const dup = await pool.request()
      .input('cod', sql.VarChar, cod_articulo)
      .query(`
        SELECT TOP 1 1
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(cod_articulo))) = @cod
      `);
    if (dup.recordset.length) {
      return res.status(409).json({ error: 'El código ya existe' });
    }

    // Insert con OUTPUT del id_articulo
    const insert = await pool.request()
      .input('cod_articulo', sql.VarChar, cod_articulo)
      .input('descripcion', sql.VarChar, descripcion)
      .input('cod_modelo', sql.VarChar, cod_modelo)
      .input('color', sql.VarChar, color)
      .input('talle', sql.VarChar, talle)
      .input('cod_barra', sql.VarChar, cod_barra)
      .input('tipo', sql.VarChar, tipo)
      .input('familia', sql.VarChar, familia)
      .input('subfamilia', sql.VarChar, subfamilia)
      .input('material', sql.VarChar, material)
      .input('iibb_aplica', sql.VarChar, iibb_aplica)
      .input('lista_precios_aplica', sql.VarChar, lista_precios_aplica)
      .query(`
        INSERT INTO articulos (
          cod_articulo, descripcion, cod_modelo, color, talle, 
          cod_barra, tipo, familia, subfamilia, material, 
          iibb_aplica, lista_precios_aplica
        )
        OUTPUT INSERTED.id_articulo
        VALUES (
          @cod_articulo, @descripcion, @cod_modelo, @color, @talle,
          @cod_barra, @tipo, @familia, @subfamilia, @material,
          @iibb_aplica, @lista_precios_aplica
        )
      `);

    const newId = insert.recordset?.[0]?.id_articulo;
    if (newId === undefined || newId === null) {
      console.error('No se obtuvo id_articulo tras INSERT');
      return res.status(500).json({ error: 'No se obtuvo el ID del nuevo artículo' });
    }

    // Devolver el registro recién creado
    const created = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT 
          id_articulo, cod_articulo, descripcion, cod_modelo, color, talle, 
          cod_barra, tipo, familia, subfamilia, material, iibb_aplica, lista_precios_aplica
        FROM articulos
        WHERE id_articulo = @id
      `);

    res.status(201).json({ message: 'Artículo creado', articulo: created.recordset[0] });
  } catch (err) {
    console.error('Error en createArticulo:', err);
    res.status(500).json({ error: 'Error al crear artículo', detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// ACTUALIZAR
// -----------------------------------------------------------------------------
exports.updateArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    let {
      cod_articulo, descripcion, cod_modelo, color, talle,
      cod_barra, tipo, familia, subfamilia, material,
      iibb_aplica, lista_precios_aplica
    } = req.body || {};

    if (!cod_articulo || !descripcion) {
      return res.status(400).json({ error: 'Debe indicar código y descripción' });
    }

    // Normalización
    cod_articulo = String(cod_articulo).trim().toUpperCase();
    descripcion = toDb(descripcion);
    cod_modelo = toDb(cod_modelo);
    color = toDb(color);
    talle = toDb(talle);
    cod_barra = toDb(cod_barra);
    tipo = toDb(tipo);
    familia = toDb(familia);
    subfamilia = toDb(subfamilia);
    material = toDb(material);
    iibb_aplica = toDb(iibb_aplica);
    lista_precios_aplica = toDb(lista_precios_aplica);

    await poolConnect;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('cod_articulo', sql.VarChar, cod_articulo)
      .input('descripcion', sql.VarChar, descripcion)
      .input('cod_modelo', sql.VarChar, cod_modelo)
      .input('color', sql.VarChar, color)
      .input('talle', sql.VarChar, talle)
      .input('cod_barra', sql.VarChar, cod_barra)
      .input('tipo', sql.VarChar, tipo)
      .input('familia', sql.VarChar, familia)
      .input('subfamilia', sql.VarChar, subfamilia)
      .input('material', sql.VarChar, material)
      .input('iibb_aplica', sql.VarChar, iibb_aplica)
      .input('lista_precios_aplica', sql.VarChar, lista_precios_aplica)
      .query(`
        UPDATE articulos
           SET cod_articulo = @cod_articulo,
               descripcion   = @descripcion,
               cod_modelo    = @cod_modelo,
               color         = @color,
               talle         = @talle,
               cod_barra     = @cod_barra,
               tipo          = @tipo,
               familia       = @familia,
               subfamilia    = @subfamilia,
               material      = @material,
               iibb_aplica   = @iibb_aplica,
               lista_precios_aplica = @lista_precios_aplica
         WHERE id_articulo = @id
      `);

    if (result.rowsAffected?.[0] === 0) return res.status(404).json({ message: 'Artículo no encontrado' });
    res.json({ message: 'Artículo actualizado' });
  } catch (err) {
    console.error('Error en updateArticulo:', err);
    res.status(500).json({ error: 'Error al actualizar artículo', detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// ELIMINAR
// -----------------------------------------------------------------------------
exports.deleteArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    await poolConnect;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM articulos WHERE id_articulo = @id');

    if (result.rowsAffected?.[0] === 0) return res.status(404).json({ message: 'Artículo no encontrado' });
    res.json({ message: 'Artículo eliminado' });
  } catch (err) {
    console.error('Error en deleteArticulo:', err);
    res.status(500).json({ error: 'Error al eliminar artículo', detalle: err.message });
  }
};

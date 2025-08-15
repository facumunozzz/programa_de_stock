// backend/controllers/ajustes.js
const { sql, poolConnect, getPool } = require('../db');

const toDb = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up   = v => (toDb(v)?.toUpperCase() ?? null);

// GET /ajustes - lista cabeceras
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        numero_ajuste AS id,
        numero_ajuste,
        deposito,
        motivo,
        fecha
      FROM dbo.ajustes
      ORDER BY fecha DESC, numero_ajuste DESC
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error('ajustes.getAll:', err);
    res.status(500).json({ error: 'Error al listar ajustes', detalle: err.message });
  }
};

// GET /ajustes/:id - cabecera + detalle
exports.getById = async (req, res) => {
  try {
    const nro = Number(req.params.id);
    if (!Number.isInteger(nro)) return res.status(400).json({ error: 'Número inválido' });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool.request().input('n', sql.Int, nro).query(`
      SELECT 
        numero_ajuste AS id,
        numero_ajuste,
        deposito,
        motivo,
        fecha
      FROM dbo.ajustes
      WHERE numero_ajuste = @n
    `);
    if (!cab.recordset.length) return res.status(404).json({ error: 'Ajuste no encontrado' });

    const det = await pool.request().input('n', sql.Int, nro).query(`
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
    console.error('ajustes.getById:', err);
    res.status(500).json({ error: 'Error al obtener detalle', detalle: err.message });
  }
};

/**
 * POST /ajustes
 * body: {
 *   deposito_id: number,
 *   motivo: string|null,
 *   items: [{ cod_articulo: string, cantidad: number }]
 * }
 */
exports.create = async (req, res) => {
  const { deposito_id, motivo, items } = req.body || {};

  if (!deposito_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos: depósito e items son obligatorios' });
  }

  // normalizo items: códigos en mayúsculas y cantidades como int (pueden ser < 0)
  const normItems = items
    .map(it => ({ cod: up(it.cod_articulo), cant: Number(it.cantidad) }))
    .filter(it => it.cod && Number.isFinite(it.cant) && it.cant !== 0);

  if (!normItems.length) return res.status(400).json({ error: 'Items inválidos' });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    // 1) Obtener nombre de depósito
    const rqDep = new sql.Request(trans);
    const dep = await rqDep.input('d', sql.Int, deposito_id).query(`
      SELECT id_deposito, nombre FROM dbo.depositos WHERE id_deposito = @d
    `);
    if (!dep.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: `Depósito inexistente: ${deposito_id}` });
    }
    const nombreDeposito = dep.recordset[0].nombre;

    // 2) Resolver artículos por código
    const cods = normItems.map(i => i.cod);
    const placeholders = cods.map((_, i) => `@c${i}`).join(',');
    const rqArts = new sql.Request(trans);
    cods.forEach((c, i) => rqArts.input(`c${i}`, sql.VarChar, c));
    const arts = await rqArts.query(`
      SELECT 
        id_articulo,
        UPPER(LTRIM(RTRIM(cod_articulo))) AS cod,
        descripcion
      FROM dbo.articulos
      WHERE UPPER(LTRIM(RTRIM(cod_articulo))) IN (${placeholders})
    `);
    const byCode = new Map(arts.recordset.map(r => [r.cod, { id_articulo: r.id_articulo, descripcion: r.descripcion }]));
    const faltantes = normItems.filter(i => !byCode.has(i.cod)).map(i => i.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'Códigos inexistentes', detalle: faltantes });
    }

    // 3) Validar que stock post-ajuste no quede < 0
    for (const it of normItems) {
      const { id_articulo } = byCode.get(it.cod);
      const rqChk = new sql.Request(trans);
      const chk = await rqChk
        .input('idArt', sql.Int, id_articulo)
        .input('idDep', sql.Int, deposito_id)
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
          error: 'Stock insuficiente para ajustar',
          detalle: { cod_articulo: it.cod, disponible, intento_ajuste: it.cant, quedaría: proyectado }
        });
      }
    }

    // 4) Generar próximo numero_ajuste (MAX+1) con lock
    const rqNro = new sql.Request(trans);
    const nroRes = await rqNro.query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
    `);
    const nextNro = Number(nroRes.recordset[0].nextNro);

    // 5) Insert cabecera
    const rqCab = new sql.Request(trans);
    await rqCab
      .input('nro', sql.Int, nextNro)
      .input('depNom', sql.VarChar, nombreDeposito)
      .input('mot', sql.VarChar, toDb(motivo))
      .query(`
        INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo, fecha)
        VALUES (@nro, @depNom, @mot, GETDATE())
      `);

    // 6) Detalle + aplicar ajustes al stock
    for (const it of normItems) {
      const { id_articulo, descripcion } = byCode.get(it.cod);

      // Detalle
      const rqDet = new sql.Request(trans);
      await rqDet
        .input('nro', sql.Int, nextNro)
        .input('cod', sql.VarChar, it.cod)
        .input('desc', sql.VarChar, descripcion || '')
        .input('cant', sql.Int, it.cant)
        .query(`
          INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad)
          VALUES (@nro, @cod, @desc, @cant)
        `);

      // Upsert de stock (suma o resta)
      const rqSt = new sql.Request(trans);
      await rqSt
        .input('idDep', sql.Int, deposito_id)
        .input('idArt', sql.Int, id_articulo)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @idDep AND id_articulo = @idArt)
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@idDep, @idArt, 0);
        `);

      const rqUpd = new sql.Request(trans);
      await rqUpd
        .input('idDep', sql.Int, deposito_id)
        .input('idArt', sql.Int, id_articulo)
        .query(`
          UPDATE dbo.stock
             SET cantidad = cantidad + ${it.cant}
           WHERE id_deposito = @idDep AND id_articulo = @idArt;
        `);
    }

    await trans.commit();

    // 7) Devolver cabecera creada
    const creado = await (await getPool()).request()
      .input('n', sql.Int, nextNro)
      .query(`
        SELECT 
          numero_ajuste AS id,
          numero_ajuste,
          deposito,
          motivo,
          fecha
        FROM dbo.ajustes
        WHERE numero_ajuste = @n
      `);

    return res.status(201).json({ message: 'Ajuste creado', ajuste: creado.recordset[0] });

  } catch (err) {
    console.error('ajustes.create:', err);
    try { if (trans) await trans.rollback(); } catch {}
    return res.status(500).json({ error: 'Error al crear ajuste', detalle: err.message });
  }
};


// backend/controllers/transferencias.js
const { sql, poolConnect, getPool } = require('../db');

const toDb = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up   = v => (toDb(v)?.toUpperCase() ?? null);

// ============ LISTADO CABECERAS ============
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        numero_transferencia AS id,   -- alias para el front
        numero_transferencia,
        origen,
        destino,
        fecha
      FROM dbo.transferencias
      ORDER BY fecha DESC, numero_transferencia DESC
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error('transferencias.getAll:', err);
    res.status(500).json({ error: 'Error al listar transferencias', detalle: err.message });
  }
};

// ============ DETALLE ============
exports.getById = async (req, res) => {
  try {
    const numero = Number(req.params.id);
    if (!Number.isInteger(numero)) return res.status(400).json({ error: 'Número inválido' });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool.request()
      .input('n', sql.Int, numero)
      .query(`
        SELECT 
          numero_transferencia AS id,
          numero_transferencia,
          origen,
          destino,
          fecha
        FROM dbo.transferencias
        WHERE numero_transferencia = @n
      `);
    if (!cab.recordset.length) return res.status(404).json({ error: 'Transferencia no encontrada' });

    const det = await pool.request()
      .input('n', sql.Int, numero)
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

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset });
  } catch (err) {
    console.error('transferencias.getById:', err);
    res.status(500).json({ error: 'Error al obtener detalle', detalle: err.message });
  }
};

// ============ CREAR (CONFIRMAR) ============
// body: { origen_id, destino_id, items: [{ cod_articulo, cantidad }] }
exports.create = async (req, res) => {
  const { origen_id, destino_id, items } = req.body || {};

  if (!origen_id || !destino_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos: origen_id, destino_id e items son obligatorios' });
  }
  if (Number(origen_id) === Number(destino_id)) {
    return res.status(400).json({ error: 'El depósito origen y destino no pueden ser iguales' });
  }

  const normItems = items.map(it => ({
    cod: up(it.cod_articulo),
    cant: Number(it.cantidad) || 0,
  })).filter(it => it.cod && it.cant > 0);

  if (!normItems.length) return res.status(400).json({ error: 'Items inválidos' });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    // 1) Nombres de depósitos (se guardan como texto en transferencias)
    const rqDepO = new sql.Request(trans);
    const depO = await rqDepO.input('o', sql.Int, origen_id).query(`
      SELECT id_deposito, nombre FROM dbo.depositos WHERE id_deposito = @o
    `);
    if (!depO.recordset.length) { await trans.rollback(); return res.status(400).json({ error: `Depósito origen inexistente: ${origen_id}` }); }

    const rqDepD = new sql.Request(trans);
    const depD = await rqDepD.input('d', sql.Int, destino_id).query(`
      SELECT id_deposito, nombre FROM dbo.depositos WHERE id_deposito = @d
    `);
    if (!depD.recordset.length) { await trans.rollback(); return res.status(400).json({ error: `Depósito destino inexistente: ${destino_id}` }); }

    const nombreOrigen  = depO.recordset[0].nombre;
    const nombreDestino = depD.recordset[0].nombre;

    // 2) Resolver artículos por código (traigo también descripción)
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

    // 3) Validar stock suficiente en ORIGEN
    for (const it of normItems) {
      const { id_articulo } = byCode.get(it.cod);
      const rqChk = new sql.Request(trans);
      const chk = await rqChk
        .input('idArt', sql.Int, id_articulo)
        .input('idDep', sql.Int, origen_id)
        .query(`
          SELECT ISNULL(SUM(cantidad),0) AS q
          FROM dbo.stock
          WHERE id_articulo = @idArt AND id_deposito = @idDep
        `);
      const disponible = Number(chk.recordset[0]?.q || 0);
      if (disponible < it.cant) {
        await trans.rollback();
        return res.status(400).json({
          error: 'Stock insuficiente en depósito origen',
          detalle: { cod_articulo: it.cod, requerido: it.cant, disponible }
        });
      }
    }

    // 4) Generar próximo numero_transferencia (MAX+1) con lock
    const rqNro = new sql.Request(trans);
    const nroRes = await rqNro.query(`
      SELECT ISNULL(MAX(numero_transferencia), 0) + 1 AS nextNro
      FROM dbo.transferencias WITH (UPDLOCK, HOLDLOCK)
    `);
    const nextNro = Number(nroRes.recordset[0].nextNro);

    // 5) Insert cabecera (guarda NOMBRES)
    const rqCab = new sql.Request(trans);
    await rqCab
      .input('nro', sql.Int, nextNro)
      .input('origNom', sql.VarChar, nombreOrigen)
      .input('destNom', sql.VarChar, nombreDestino)
      .query(`
        INSERT INTO dbo.transferencias (numero_transferencia, origen, destino, fecha)
        VALUES (@nro, @origNom, @destNom, GETDATE())
      `);

    // 6) Detalle + ajustes de stock
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
          INSERT INTO dbo.transferencia_detalles (transferencia_id, cod_articulo, descripcion, cantidad)
          VALUES (@nro, @cod, @desc, @cant)
        `);

      // Resta en origen
      const rqO = new sql.Request(trans);
      await rqO
        .input('idDepO', sql.Int, origen_id)
        .input('idArtO', sql.Int, id_articulo)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @idDepO AND id_articulo = @idArtO)
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@idDepO, @idArtO, 0);
          UPDATE dbo.stock
             SET cantidad = cantidad - ${it.cant}
           WHERE id_deposito = @idDepO AND id_articulo = @idArtO;
        `);

      // Suma en destino
      const rqD = new sql.Request(trans);
      await rqD
        .input('idDepD', sql.Int, destino_id)
        .input('idArtD', sql.Int, id_articulo)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.stock WHERE id_deposito = @idDepD AND id_articulo = @idArtD)
            INSERT INTO dbo.stock (id_deposito, id_articulo, cantidad) VALUES (@idDepD, @idArtD, 0);
          UPDATE dbo.stock
             SET cantidad = cantidad + ${it.cant}
           WHERE id_deposito = @idDepD AND id_articulo = @idArtD;
        `);
    }

    await trans.commit();

    // 7) Devolver cabecera creada
    const creado = await (await getPool()).request()
      .input('n', sql.Int, nextNro)
      .query(`
        SELECT 
          numero_transferencia AS id,
          numero_transferencia,
          origen,
          destino,
          fecha
        FROM dbo.transferencias
        WHERE numero_transferencia = @n
      `);

    return res.status(201).json({ message: 'Transferencia creada', transferencia: creado.recordset[0] });

  } catch (err) {
    console.error('transferencias.create:', err);
    try { if (trans) await trans.rollback(); } catch {}
    return res.status(500).json({ error: 'Error al crear transferencia', detalle: err.message });
  }
};

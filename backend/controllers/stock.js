const pool = require('../db');
const sql = require('mssql');

exports.getAll = async (req, res) => {
  try {
    await pool.connect();
    const result = await pool.request().query(`
      SELECT
        a.cod_articulo,
        a.descripcion,
        s.cantidad,
        d.nombre AS deposito
      FROM stock s
      JOIN articulos a ON a.id_articulo = s.id_articulo
      JOIN depositos d ON d.id_deposito = s.id_deposito
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const pool = require('../db');
const sql = require('mssql');

// TODO: implementar lógica del módulo produccion
exports.getAll = async (req, res) => {
  try {
    await pool.connect();
    const result = await pool.request().query('SELECT * FROM produccion');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const pool = require('../db');
const sql = require('mssql');

exports.getAll = async (req, res) => {
  try {
    await pool.connect();
    const result = await pool.request().query('SELECT * FROM depositos');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    await pool.connect();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM depositos WHERE id_deposito = @id');
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { nombre } = req.body;
    await pool.connect();
    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .query('INSERT INTO depositos (nombre) VALUES (@nombre)');
    res.status(201).json({ message: 'Depósito creado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre } = req.body;
    await pool.connect();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.VarChar, nombre)
      .query('UPDATE depositos SET nombre = @nombre WHERE id_deposito = @id');
    res.json({ message: 'Depósito actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await pool.connect();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM depositos WHERE id_deposito = @id');
    res.json({ message: 'Depósito eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

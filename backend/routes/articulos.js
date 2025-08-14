// routes/articulos.js
const express = require('express');
const router = express.Router();
const articulos = require('../controllers/articulos');

router.get('/codigo/:cod?', articulos.getArticuloByCodigo); // específico primero
router.get('/', articulos.getAllArticulos);
router.get('/:id', articulos.getArticuloById);
router.post('/', articulos.createArticulo);
router.put('/:id', articulos.updateArticulo);
router.delete('/:id', articulos.deleteArticulo);

module.exports = router;


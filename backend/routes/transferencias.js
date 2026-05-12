const express = require('express');
const router = express.Router();
const controller = require('../controllers/transferencias');
const { authRequired } = require("../middleware/auth");

// Listado (cabeceras)
router.get('/', controller.getAll);

// Detalle por id
router.get('/:id', controller.getById);

// Crear transferencia (origen -> destino con items)
router.post('/',authRequired, controller.create);

module.exports = router;




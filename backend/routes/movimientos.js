const express = require('express');
const router = express.Router();
const controller = require('../controllers/movimientos');

router.get('/', controller.getAll);
// TODO: agregar más rutas para movimientos

module.exports = router;

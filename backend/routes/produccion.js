const express = require('express');
const router = express.Router();
const controller = require('../controllers/produccion');

router.get('/', controller.getAll);
// TODO: agregar más rutas para produccion

module.exports = router;

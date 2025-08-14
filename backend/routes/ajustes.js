const express = require('express');
const router = express.Router();
const controller = require('../controllers/ajustes');

router.get('/', controller.getAll);
// TODO: agregar más rutas para ajustes

module.exports = router;

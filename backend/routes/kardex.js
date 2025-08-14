const express = require('express');
const router = express.Router();
const controller = require('../controllers/kardex');

router.get('/', controller.getAll);
// TODO: agregar más rutas para kardex

module.exports = router;

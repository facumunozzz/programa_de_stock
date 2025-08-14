const express = require('express');
const router = express.Router();
const controller = require('../controllers/transferencias.js');

router.get('/', controller.getAll);
router.post('/', controller.create);
router.get('/:id', controller.getDetalle);

module.exports = router;



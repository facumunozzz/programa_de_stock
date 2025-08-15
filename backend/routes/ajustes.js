// backend/routes/ajustes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/ajustes');

router.get('/', controller.getAll);
router.get('/:id', controller.getById);    // id = numero_ajuste
router.post('/', controller.create);

module.exports = router;


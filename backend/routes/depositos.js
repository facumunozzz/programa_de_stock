const express = require('express');
const router = express.Router();
const depositosController = require('../controllers/depositos');

router.get('/', depositosController.getAll);
router.get('/:id', depositosController.getById);
router.post('/', depositosController.create);
router.put('/:id', depositosController.update);
router.delete('/:id', depositosController.remove);

module.exports = router;

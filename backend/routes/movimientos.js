// routes/movimientos.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/movimientos');
const {authRequired} = require('../middleware/auth');   

router.get('/', authRequired, controller.getAll);

module.exports = router;


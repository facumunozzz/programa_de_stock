// backend/routes/fabrica.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/fabrica");
const { authRequired } = require("../middleware/auth");

// GET /fabrica/ordenes
router.get("/ordenes", authRequired, ctrl.getAll);

// GET /fabrica/ordenes/:id
router.get("/ordenes/:id", authRequired, ctrl.getById);

// POST /fabrica/ordenes
router.post("/ordenes", authRequired, ctrl.create);

module.exports = router;

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/clasificaciones");
const { authRequired, adminOnly } = require("../middleware/auth");

// === RUTAS ===
router.get("/activas", authRequired, ctrl.getActivas);
router.get("/", authRequired, ctrl.getAll);
router.post("/", authRequired, adminOnly, ctrl.create);
router.patch("/:id", authRequired, adminOnly, ctrl.updateFlag);
router.delete("/:id", authRequired, adminOnly, ctrl.remove);

module.exports = router;

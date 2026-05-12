const express = require("express");
const router = express.Router();

const controller = require("../controllers/remitos");

router.get("/", controller.getAll);
router.get("/proximo-numero", controller.getProximoNumero);

// Artículos habilitables para remitos
router.get("/articulos", controller.getArticulosConFormula);
router.get("/articulos-activos", controller.getArticulosActivos);
router.put("/articulos/:id/toggle", controller.toggleArticuloRemito);

// Traer materiales de fórmula para remito
router.get("/articulos/:codigo/materiales", controller.getMaterialesArticuloRemito);

router.post("/", controller.create);

module.exports = router;
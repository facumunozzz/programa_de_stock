// backend/routes/ajustes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const { authRequired } = require("../middleware/auth");

const controller = require("../controllers/ajustes");

// =========================
// Plantilla / Importación
// =========================
router.get("/plantilla", controller.downloadTemplate);
router.post(
  "/importar",
  authRequired,
  upload.single("file"),
  controller.importarDesdeExcel
);

// =========================
// Motivos de ajuste
// IMPORTANTE: van antes de /:id
// =========================
router.get("/motivos", controller.getMotivos);
router.post("/motivos", authRequired, controller.createMotivo);
router.put("/motivos/:id", authRequired, controller.updateMotivo);
router.delete("/motivos/:id", authRequired, controller.deleteMotivo);

// =========================
// Artículo por código/barra
// =========================
router.get("/articulo", controller.getArticuloByCodigo);

// =========================
// Listados / detalle
// =========================
router.get("/", controller.getAll);
router.get("/:id", controller.getById);

// =========================
// Crear ajuste
// =========================
router.post("/", authRequired, controller.create);

module.exports = router;
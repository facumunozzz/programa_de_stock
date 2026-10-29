const express = require("express");
const router = express.Router();
const controller = require("../controllers/recuentoCiclico");
const { authRequired } = require("../middleware/auth");

router.get("/categorias", authRequired, controller.getCategorias);
router.post("/categorias", authRequired, controller.crearCategoria);
router.put("/categorias/:id", authRequired, controller.actualizarCategoria);
router.delete("/categorias/:id", authRequired, controller.eliminarCategoria);

router.get("/motivos", authRequired, controller.getMotivosRecuento);
router.post("/motivos", authRequired, controller.crearMotivoRecuento);
router.put("/motivos/:id", authRequired, controller.editarMotivoRecuento);
router.delete("/motivos/:id", authRequired, controller.eliminarMotivoRecuento);

router.get("/base", authRequired, controller.getBase);
router.put("/base", authRequired, controller.guardarBase);
router.post("/base/programar", authRequired, controller.programarBase);

router.get("/sesiones", authRequired, controller.getSesiones);
router.post("/sesiones", authRequired, controller.generarConteo);
router.get("/sesiones/:id", authRequired, controller.getSesion);
router.post("/sesiones/:id/confirmar", authRequired, controller.confirmarConteo);

router.get("/transacciones", authRequired, controller.getTransacciones);

router.get("/kaizen", authRequired, controller.getKaizen);

module.exports = router;

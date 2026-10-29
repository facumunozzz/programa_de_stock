import React, { useEffect, useMemo, useState } from "react";

import { toast } from "react-toastify";

import api from "../api/axiosConfig";

import "../styles/recuentoCiclico.css";

// =====================================================
// FECHAS
// =====================================================

const hoyYmd = () => {
  const d = new Date();

  const y = d.getFullYear();

  const m = String(d.getMonth() + 1).padStart(2, "0");

  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
};

const fechaInput = (v) => (v ? String(v).slice(0, 10) : "");

// =====================================================
// COMPONENTE
// =====================================================

export default function RecuentoCiclicoBase() {
  const [rows, setRows] = useState([]);

  const [depositos, setDepositos] = useState([]);

  const [categorias, setCategorias] = useState([]);

  const [depositoId, setDepositoId] = useState("");

  const [buscar, setBuscar] = useState("");

  const [fechaInicio, setFechaInicio] = useState(hoyYmd());

  const [loading, setLoading] = useState(false);

  const [guardandoFilas, setGuardandoFilas] = useState(new Set());

  // ===================================================
  // MODAL CATEGORÍAS
  // ===================================================

  const [modalCategorias, setModalCategorias] = useState(false);

  const [editandoCategoria, setEditandoCategoria] = useState(null);

  const [formCategoria, setFormCategoria] = useState({
    codigo: "",
    nombre: "",
    dias: 30,
  });

  const [guardandoCategoria, setGuardandoCategoria] = useState(false);

  // ===================================================
  // HELPERS
  // ===================================================

  const claveFila = (fila) => `${fila.id_articulo}-${fila.id_deposito}`;

  const esGuardando = (fila) => guardandoFilas.has(claveFila(fila));

  // ===================================================
  // CARGAR DEPÓSITOS
  // ===================================================

  const cargarDepositos = async () => {
    try {
      const r = await api.get("/depositos");

      setDepositos(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);

      toast.error("No se pudieron cargar las centrales/depósitos");
    }
  };

  // ===================================================
  // CARGAR CATEGORÍAS
  // ===================================================

  const cargarCategorias = async () => {
    try {
      const r = await api.get("/recuento-ciclico/categorias");

      setCategorias(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);

      toast.error(
        e.response?.data?.error || "No se pudieron cargar las categorías",
      );
    }
  };

  // ===================================================
  // CARGAR BASE
  // ===================================================

  const cargar = async () => {
    setLoading(true);

    try {
      const r = await api.get("/recuento-ciclico/base", {
        params: depositoId
          ? {
              deposito_id: Number(depositoId),
            }
          : {},
      });

      setRows(
        (Array.isArray(r.data) ? r.data : []).map((x) => ({
          ...x,

          id_categoria: x.id_categoria ? Number(x.id_categoria) : null,

          frecuencia_dias: x.frecuencia_dias ? Number(x.frecuencia_dias) : null,

          proximo_recuento: fechaInput(x.proximo_recuento),
        })),
      );
    } catch (e) {
      console.error(e);

      toast.error(
        e.response?.data?.error || "No se pudo cargar la base de recuento",
      );
    } finally {
      setLoading(false);
    }
  };

  // ===================================================
  // INICIAL
  // ===================================================

  useEffect(() => {
    cargarDepositos();
    cargarCategorias();
  }, []);

  useEffect(() => {
    cargar();
  }, [depositoId]);

  // ===================================================
  // FILTRO
  // ===================================================

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();

    if (!q) {
      return rows;
    }

    return rows.filter((r) =>
      [
        r.codigo,
        r.descripcion,
        r.proveedor,
        r.deposito,
        r.categoria,
        r.categoria_nombre,
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, buscar]);

  // ===================================================
  // GUARDADO AUTOMÁTICO
  // ===================================================

  const guardarFila = async (filaAnterior, filaNueva) => {
    const key = claveFila(filaNueva);

    setGuardandoFilas((prev) => {
      const next = new Set(prev);

      next.add(key);

      return next;
    });

    setRows((prev) =>
      prev.map((r) =>
        Number(r.id_articulo) === Number(filaNueva.id_articulo) &&
        Number(r.id_deposito) === Number(filaNueva.id_deposito)
          ? filaNueva
          : r,
      ),
    );

    try {
      await api.put("/recuento-ciclico/base", {
        items: [
          {
            id_articulo: Number(filaNueva.id_articulo),

            id_deposito: Number(filaNueva.id_deposito),

            id_categoria: filaNueva.id_categoria
              ? Number(filaNueva.id_categoria)
              : null,

            proximo_recuento: filaNueva.proximo_recuento || null,
          },
        ],
      });
    } catch (e) {
      // Si falla, volvemos al
      // valor anterior.

      setRows((prev) =>
        prev.map((r) =>
          Number(r.id_articulo) === Number(filaAnterior.id_articulo) &&
          Number(r.id_deposito) === Number(filaAnterior.id_deposito)
            ? filaAnterior
            : r,
        ),
      );

      toast.error(
        e.response?.data?.detalle ||
          e.response?.data?.error ||
          "No se pudo guardar el cambio",
      );
    } finally {
      setGuardandoFilas((prev) => {
        const next = new Set(prev);

        next.delete(key);

        return next;
      });
    }
  };

  // ===================================================
  // CAMBIAR CATEGORÍA
  // ===================================================

  const cambiarCategoria = async (fila, valor) => {
    const idCategoria = valor ? Number(valor) : null;

    const categoria = categorias.find(
      (c) => Number(c.id_categoria) === idCategoria,
    );

    const nueva = {
      ...fila,

      id_categoria: idCategoria,

      categoria: categoria?.codigo || "",

      categoria_nombre: categoria?.nombre || "",

      frecuencia_dias: categoria ? Number(categoria.dias) : null,

      // Sin categoría no puede
      // quedar programado.
      proximo_recuento: idCategoria ? fila.proximo_recuento : "",
    };

    await guardarFila(fila, nueva);
  };

  // ===================================================
  // CAMBIAR FECHA INDIVIDUAL
  // ===================================================

  const cambiarFecha = async (fila, fecha) => {
    if (!fila.id_categoria) {
      toast.info("Primero debe asignar una categoría");

      return;
    }

    const nueva = {
      ...fila,
      proximo_recuento: fecha,
    };

    await guardarFila(fila, nueva);
  };

  // ===================================================
  // REASIGNAR FECHAS
  // ===================================================

  const reasignarFechas = async () => {
    if (!fechaInicio) {
      toast.info("Indicá una fecha inicial");

      return;
    }

    setLoading(true);

    try {
      const r = await api.post("/recuento-ciclico/base/programar", {
        fecha_inicio: fechaInicio,

        depositos: depositoId ? [Number(depositoId)] : [],
      });

      toast.success(`${r.data?.actualizados || 0} líneas reasignadas`);

      await cargar();
    } catch (e) {
      toast.error(
        e.response?.data?.detalle ||
          e.response?.data?.error ||
          "No se pudieron reasignar las fechas",
      );
    } finally {
      setLoading(false);
    }
  };

  // ===================================================
  // MODAL - NUEVA CATEGORÍA
  // ===================================================

  const nuevaCategoria = () => {
    setEditandoCategoria(null);

    setFormCategoria({
      codigo: "",
      nombre: "",
      dias: 30,
    });
  };

  // ===================================================
  // MODAL - EDITAR
  // ===================================================

  const editarCategoria = (categoria) => {
    setEditandoCategoria(Number(categoria.id_categoria));

    setFormCategoria({
      codigo: categoria.codigo || "",

      nombre: categoria.nombre || "",

      dias: Number(categoria.dias || 1),
    });
  };

  // ===================================================
  // MODAL - GUARDAR
  // ===================================================

  const guardarCategoria = async () => {
    const codigo = formCategoria.codigo.trim();

    const dias = Number(formCategoria.dias);

    if (!codigo) {
      toast.info("Ingresá el código de la categoría");

      return;
    }

    if (!Number.isInteger(dias) || dias <= 0) {
      toast.info("Los días deben ser mayores que cero");

      return;
    }

    setGuardandoCategoria(true);

    try {
      const body = {
        codigo,
        nombre: formCategoria.nombre.trim() || codigo,

        dias,
      };

      if (editandoCategoria) {
        await api.put(
          `/recuento-ciclico/categorias/${editandoCategoria}`,
          body,
        );

        toast.success("Categoría modificada");
      } else {
        await api.post("/recuento-ciclico/categorias", body);

        toast.success("Categoría creada");
      }

      nuevaCategoria();

      await cargarCategorias();

      await cargar();
    } catch (e) {
      toast.error(
        e.response?.data?.detalle ||
          e.response?.data?.error ||
          "No se pudo guardar la categoría",
      );
    } finally {
      setGuardandoCategoria(false);
    }
  };

  // ===================================================
  // MODAL - ELIMINAR
  // ===================================================

  const eliminarCategoria = async (categoria) => {
    const confirmar = window.confirm(
      `¿Eliminar la categoría ${categoria.codigo}?`,
    );

    if (!confirmar) {
      return;
    }

    try {
      await api.delete(
        `/recuento-ciclico/categorias/${categoria.id_categoria}`,
      );

      toast.success("Categoría eliminada");

      await cargarCategorias();

      await cargar();

      nuevaCategoria();
    } catch (e) {
      toast.error(
        e.response?.data?.error || "No se pudo eliminar la categoría",
      );
    }
  };

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="rc-page">
      <h2 className="module-title">BASE DE RECUENTO CÍCLICO</h2>

      {/* ============================================= */}
      {/* FILTROS */}
      {/* ============================================= */}

      <div className="rc-toolbar rc-no-print">
        <label className="rc-field">
          Central / depósito
          <select
            value={depositoId}
            onChange={(e) => setDepositoId(e.target.value)}
          >
            <option value="">Todos</option>

            {depositos.map((d) => (
              <option key={d.id_deposito} value={d.id_deposito}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>

        <label
          className="rc-field"
          style={{
            minWidth: 280,
          }}
        >
          Buscar
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Código, descripción, proveedor, depósito..."
          />
        </label>

        <button
          type="button"
          className="rc-btn secondary"
          onClick={() => {
            nuevaCategoria();

            setModalCategorias(true);
          }}
        >
          Categorías
        </button>
      </div>

      {/* ============================================= */}
      {/* REASIGNACIÓN */}
      {/* ============================================= */}

      <div className="rc-toolbar rc-no-print">
        <label className="rc-field">
          Fecha inicial
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="rc-btn"
          onClick={reasignarFechas}
          disabled={loading}
        >
          {loading ? "Procesando..." : "Reasignar fechas"}
        </button>
      </div>

      {/* ============================================= */}
      {/* RESUMEN */}
      {/* ============================================= */}

      <div className="rc-summary">
        <span>
          Líneas visibles: <b>{filtrados.length}</b>
        </span>

        <span>Artículo + depósito</span>
      </div>

      {/* ============================================= */}
      {/* TABLA */}
      {/* ============================================= */}

      <div className="rc-scroll">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Código</th>

              <th>Descripción</th>

              <th>Depósito</th>

              <th>Categoría</th>

              <th>Días</th>

              <th>Próximo recuento</th>

              <th>Último recuento</th>
            </tr>
          </thead>

          <tbody>
            {filtrados.map((r) => {
              const guardando = esGuardando(r);

              return (
                <tr key={`${r.id_articulo}-${r.id_deposito}`}>
                  <td>{r.codigo}</td>

                  <td className="descripcion">{r.descripcion}</td>

                  <td>{r.deposito}</td>

                  <td>
                    <select
                      value={r.id_categoria || ""}
                      disabled={guardando}
                      onChange={(e) => cambiarCategoria(r, e.target.value)}
                    >
                      <option value="">Sin categoría</option>

                      {categorias.map((c) => (
                        <option key={c.id_categoria} value={c.id_categoria}>
                          {c.codigo} - {c.dias} días
                        </option>
                      ))}
                    </select>
                  </td>

                  <td
                    style={{
                      textAlign: "center",
                    }}
                  >
                    {r.frecuencia_dias ? `${r.frecuencia_dias}` : "-"}
                  </td>

                  <td>
                    <input
                      type="date"
                      value={r.proximo_recuento || ""}
                      disabled={!r.id_categoria || guardando}
                      onChange={(e) => cambiarFecha(r, e.target.value)}
                    />

                    {guardando && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 11,
                        }}
                      >
                        Guardando...
                      </span>
                    )}
                  </td>

                  <td>{fechaInput(r.ultimo_recuento) || "-"}</td>
                </tr>
              );
            })}

            {!loading && filtrados.length === 0 && (
              <tr>
                <td
                  colSpan="7"
                  style={{
                    textAlign: "center",
                    padding: 20,
                  }}
                >
                  No hay artículos para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ============================================= */}
      {/* MODAL CATEGORÍAS */}
      {/* ============================================= */}

      {modalCategorias && (
        <div
          style={{
            position: "fixed",

            inset: 0,

            background: "rgba(0,0,0,0.45)",

            display: "flex",

            alignItems: "center",

            justifyContent: "center",

            zIndex: 9999,

            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setModalCategorias(false);
            }
          }}
        >
          <div
            style={{
              width: "min(850px, 96vw)",

              maxHeight: "90vh",

              overflowY: "auto",

              background: "#fff",

              borderRadius: 10,

              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",

              padding: 20,
            }}
          >
            {/* -------------------------------------- */}
            {/* CABECERA */}
            {/* -------------------------------------- */}

            <div
              style={{
                display: "flex",

                justifyContent: "space-between",

                alignItems: "center",

                gap: 15,

                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  margin: 0,
                }}
              >
                Categorías de Recuento Cíclico
              </h3>

              <button
                type="button"
                className="rc-btn secondary"
                onClick={() => setModalCategorias(false)}
              >
                Cerrar
              </button>
            </div>

            {/* -------------------------------------- */}
            {/* FORMULARIO */}
            {/* -------------------------------------- */}

            <div
              className="rc-toolbar"
              style={{
                marginBottom: 20,
              }}
            >
              <label className="rc-field">
                Código
                <input
                  value={formCategoria.codigo}
                  onChange={(e) =>
                    setFormCategoria((prev) => ({
                      ...prev,
                      codigo: e.target.value,
                    }))
                  }
                  placeholder="Ej. A"
                  maxLength={20}
                />
              </label>

              <label
                className="rc-field"
                style={{
                  minWidth: 220,
                }}
              >
                Nombre
                <input
                  value={formCategoria.nombre}
                  onChange={(e) =>
                    setFormCategoria((prev) => ({
                      ...prev,
                      nombre: e.target.value,
                    }))
                  }
                  placeholder="Ej. Alta rotación"
                />
              </label>

              <label className="rc-field">
                Días
                <input
                  type="number"
                  min="1"
                  value={formCategoria.dias}
                  onChange={(e) =>
                    setFormCategoria((prev) => ({
                      ...prev,
                      dias: e.target.value,
                    }))
                  }
                  style={{
                    width: 90,
                  }}
                />
              </label>

              <button
                type="button"
                className="rc-btn"
                disabled={guardandoCategoria}
                onClick={guardarCategoria}
              >
                {editandoCategoria ? "Guardar cambios" : "Crear categoría"}
              </button>

              {editandoCategoria && (
                <button
                  type="button"
                  className="rc-btn secondary"
                  onClick={nuevaCategoria}
                >
                  Cancelar edición
                </button>
              )}
            </div>

            {/* -------------------------------------- */}
            {/* LISTADO */}
            {/* -------------------------------------- */}

            <div className="rc-scroll">
              <table className="rc-table">
                <thead>
                  <tr>
                    <th>Código</th>

                    <th>Nombre</th>

                    <th>Días</th>

                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {categorias.map((c) => (
                    <tr key={c.id_categoria}>
                      <td>
                        <b>{c.codigo}</b>
                      </td>

                      <td>{c.nombre}</td>

                      <td>{c.dias}</td>

                      <td>
                        <div
                          style={{
                            display: "flex",

                            gap: 8,

                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="rc-btn secondary"
                            onClick={() => editarCategoria(c)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="rc-btn secondary"
                            onClick={() => eliminarCategoria(c)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {categorias.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        style={{
                          textAlign: "center",
                        }}
                      >
                        No hay categorías.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p
              style={{
                fontSize: 12,
                marginTop: 15,
                opacity: 0.75,
              }}
            >
              Al modificar los días de una categoría, las fechas ya programadas
              no se cambian automáticamente. Usá “Reasignar fechas” cuando
              quieras recalcularlas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

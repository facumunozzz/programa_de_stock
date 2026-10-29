import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../api/axiosConfig";
import "../styles/recuentoCiclico.css";

const hoyYmd = () => {
  const d = new Date();

  const y = d.getFullYear();

  const m = String(d.getMonth() + 1).padStart(2, "0");

  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
};

export default function RecuentoCiclicoConteo() {
  const [depositos, setDepositos] = useState([]);
  const [depositosSel, setDepositosSel] = useState(new Set());

  const [fechaDesde, setFechaDesde] = useState(hoyYmd());
  const [fechaHasta, setFechaHasta] = useState(hoyYmd());

  const [sesiones, setSesiones] = useState([]);

  const [idRecuento, setIdRecuento] = useState(null);

  const [cabecera, setCabecera] = useState(null);

  const [rows, setRows] = useState([]);

  const [motivos, setMotivos] = useState([]);

  const [loading, setLoading] = useState(false);

  const conteoRefs = useRef({});

  const cargarDepositos = async () => {
    try {
      const r = await api.get("/depositos");

      setDepositos(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);

      toast.error("No se pudieron cargar las centrales/depósitos");
    }
  };

  // =====================================================
  // MOTIVOS
  // =====================================================

  const cargarMotivos = async () => {
    try {
      const r = await api.get("/recuento-ciclico/motivos");

      setMotivos(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);

      toast.error(
        e.response?.data?.error || "No se pudieron cargar los motivos",
      );
    }
  };

  // =====================================================
  // SESIONES
  // =====================================================

  const cargarSesiones = async () => {
    try {
      const r = await api.get("/recuento-ciclico/sesiones");

      setSesiones(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);
    }
  };

  // =====================================================
  // ABRIR RECUENTO
  // =====================================================

  const abrir = async (id) => {
    setLoading(true);

    try {
      const r = await api.get(`/recuento-ciclico/sesiones/${id}`);

      setIdRecuento(Number(id));

      setCabecera(r.data?.cabecera || null);

      setRows(
        (r.data?.detalle || []).map((x) => ({
          ...x,

          cantidad_contada:
            x.cantidad_contada == null ? "" : String(x.cantidad_contada),

          motivo: x.motivo || "",

          observaciones: x.observaciones || "",
        })),
      );
    } catch (e) {
      console.error(e);

      toast.error(e.response?.data?.error || "No se pudo abrir el recuento");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // INICIAL
  // =====================================================

  useEffect(() => {
    cargarDepositos();

    cargarMotivos();

    cargarSesiones();
  }, []);

  // =====================================================
  // DEPÓSITOS SELECCIONADOS
  // =====================================================

  const toggleDeposito = (id) => {
    setDepositosSel((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  // =====================================================
  // GENERAR RECUENTO
  // =====================================================

  const generar = async () => {
    setLoading(true);

    try {
      const r = await api.post("/recuento-ciclico/sesiones", {
        fecha_desde: fechaDesde,

        fecha_hasta: fechaHasta,

        depositos: [...depositosSel],
      });

      toast.success(
        `Recuento #${r.data.id_recuento} generado con ${r.data.filas} filas`,
      );

      await cargarSesiones();

      await abrir(r.data.id_recuento);
    } catch (e) {
      console.error(e);

      toast.error(
        e.response?.data?.error ||
          e.response?.data?.detalle ||
          "No se pudo generar el recuento",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // CAMBIAR DATO DE FILA
  // =====================================================

  const cambiar = (id, campo, valor) => {
    setRows((prev) =>
      prev.map((r) =>
        Number(r.id_detalle) === Number(id)
          ? {
              ...r,
              [campo]: valor,
            }
          : r,
      ),
    );
  };

  // =====================================================
  // ENTER -> SIGUIENTE FILA
  // =====================================================

  const irSiguienteFila = (idDetalleActual) => {
    const indiceActual = rows.findIndex(
      (r) => Number(r.id_detalle) === Number(idDetalleActual),
    );

    if (indiceActual < 0) {
      return;
    }

    // Buscar la próxima fila
    // que todavía no esté confirmada.
    for (let i = indiceActual + 1; i < rows.length; i += 1) {
      if (!rows[i].confirmado_en) {
        const idSiguiente = Number(rows[i].id_detalle);

        setTimeout(() => {
          const control = conteoRefs.current[idSiguiente];

          if (control) {
            control.focus();

            control.select?.();
          }
        }, 0);

        return;
      }
    }
  };

  const manejarEnter = (e, idDetalle) => {
    if (e.key !== "Enter") {
      return;
    }

    e.preventDefault();

    irSiguienteFila(idDetalle);
  };

  // =====================================================
  // FILAS CARGADAS
  // =====================================================

  const cargados = useMemo(
    () =>
      rows.filter(
        (r) => !r.confirmado_en && String(r.cantidad_contada).trim() !== "",
      ),
    [rows],
  );

  const pendientes = rows.filter((r) => !r.confirmado_en).length;

  // =====================================================
  // CONFIRMAR
  // =====================================================

  const confirmar = async () => {
    if (!idRecuento) {
      return;
    }

    if (!cargados.length) {
      toast.info("No hay cantidades cargadas para confirmar");

      return;
    }

    const invalidos = cargados.filter(
      (r) =>
        Number(r.cantidad_contada) < 0 ||
        !Number.isFinite(Number(r.cantidad_contada)),
    );

    if (invalidos.length) {
      toast.error("Hay cantidades contadas inválidas");

      return;
    }

    // ===================================================
    // VALIDAR MOTIVO CUANDO HAY DIFERENCIA
    // ===================================================

    const sinMotivo = cargados.filter((r) => {
      const contado = Number(r.cantidad_contada);

      const teorico = Number(r.stock_teorico || 0);

      const diferencia = contado - teorico;

      return Math.abs(diferencia) > 0.0000001 && !String(r.motivo || "").trim();
    });

    if (sinMotivo.length) {
      toast.error(
        `Hay ${sinMotivo.length} fila(s) con diferencia sin motivo seleccionado.`,
      );

      return;
    }

    const confirma = window.confirm(
      `Se confirmarán ${cargados.length} filas. Las diferencias ajustarán el stock automáticamente. ¿Continuar?`,
    );

    if (!confirma) {
      return;
    }

    setLoading(true);

    try {
      const r = await api.post(
        `/recuento-ciclico/sesiones/${idRecuento}/confirmar`,
        {
          items: cargados.map((x) => ({
            id_detalle: Number(x.id_detalle),

            cantidad_contada: Number(x.cantidad_contada),

            motivo: x.motivo || null,

            observaciones: x.observaciones || null,
          })),
        },
      );

      toast.success(
        `${r.data.procesados} filas confirmadas; ${r.data.con_ajuste} generaron ajuste`,
      );

      await abrir(idRecuento);

      await cargarSesiones();
    } catch (e) {
      console.error(e);

      toast.error(
        e.response?.data?.detalle ||
          e.response?.data?.error ||
          "No se pudo confirmar",
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="rc-page">
      <h2 className="module-title">RECUENTO CÍCLICO - CONTEO</h2>

      {/* ============================================== */}
      {/* GENERAR */}
      {/* ============================================== */}

      <div className="rc-card rc-no-print">
        <div
          className="rc-toolbar"
          style={{
            margin: 0,
            border: 0,
            padding: 0,
          }}
        >
          <label className="rc-field">
            Desde
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </label>

          <label className="rc-field">
            Hasta
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </label>

          <button
            type="button"
            className="rc-btn"
            onClick={generar}
            disabled={loading}
          >
            Generar recuento
          </button>
        </div>

        <div
          className="rc-muted"
          style={{
            marginTop: 8,
          }}
        >
          Sin filtro se trae cada artículo programado en todas las
          centrales/depósitos donde tenga registro de stock.
        </div>

        <div
          className="rc-depositos"
          style={{
            marginTop: 10,
          }}
        >
          {depositos.map((d) => (
            <label key={d.id_deposito}>
              <input
                type="checkbox"
                checked={depositosSel.has(Number(d.id_deposito))}
                onChange={() => toggleDeposito(Number(d.id_deposito))}
              />

              {d.nombre}
            </label>
          ))}
        </div>
      </div>

      {/* ============================================== */}
      {/* SESIONES */}
      {/* ============================================== */}

      <div className="rc-card rc-no-print">
        <b>Recuentos abiertos / parciales</b>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
          }}
        >
          {sesiones.length === 0 && (
            <span className="rc-muted">No hay recuentos pendientes.</span>
          )}

          {sesiones.map((s) => (
            <button
              type="button"
              key={s.id_recuento}
              className="rc-btn secondary"
              onClick={() => abrir(s.id_recuento)}
            >
              #{s.id_recuento} · {String(s.fecha_desde).slice(0, 10)} a{" "}
              {String(s.fecha_hasta).slice(0, 10)} · {s.pendientes} pendientes
            </button>
          ))}
        </div>
      </div>

      {/* ============================================== */}
      {/* RECUENTO */}
      {/* ============================================== */}

      {cabecera && (
        <>
          <div className="rc-toolbar rc-no-print">
            <span>
              Recuento <b>#{idRecuento}</b>
            </span>

            <span
              className={`rc-badge ${
                cabecera.estado === "CONFIRMADO" ? "ok" : "warn"
              }`}
            >
              {cabecera.estado}
            </span>

            <span>
              Pendientes: <b>{pendientes}</b>
            </span>

            <span>
              Cargados ahora: <b>{cargados.length}</b>
            </span>

            <button
              type="button"
              className="rc-btn"
              onClick={confirmar}
              disabled={loading || !cargados.length}
            >
              Confirmar cargados
            </button>

            <button
              type="button"
              className="rc-btn secondary"
              onClick={() => window.print()}
            >
              Imprimir
            </button>
          </div>

          <div className="rc-scroll">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Código</th>

                  <th>Descripción</th>

                  <th>Central</th>

                  <th>Stock teórico</th>

                  <th>Conteo físico</th>

                  <th>Diferencia</th>

                  <th>Motivo</th>

                  <th>Observaciones / cómo se resolvió</th>

                  <th>Estado</th>

                  <th>Ajuste ERP</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const tieneConteo = String(r.cantidad_contada).trim() !== "";

                  const diff = tieneConteo
                    ? Number(r.cantidad_contada) - Number(r.stock_teorico || 0)
                    : null;

                  const hayDiferencia =
                    diff !== null && Math.abs(diff) > 0.0000001;

                  return (
                    <tr
                      key={r.id_detalle}
                      className={
                        r.confirmado_en
                          ? "rc-row-confirmed"
                          : hayDiferencia
                            ? "rc-row-diff"
                            : ""
                      }
                    >
                      {/* CÓDIGO */}

                      <td>{r.codigo}</td>

                      {/* DESCRIPCIÓN */}

                      <td className="descripcion">{r.descripcion}</td>

                      {/* DEPÓSITO */}

                      <td>{r.deposito}</td>

                      {/* STOCK TEÓRICO */}

                      <td
                        style={{
                          textAlign: "right",
                        }}
                      >
                        {Number(r.stock_teorico || 0).toLocaleString("es-AR")}
                      </td>

                      {/* CONTEO */}

                      <td>
                        <input
                          ref={(el) => {
                            if (el) {
                              conteoRefs.current[Number(r.id_detalle)] = el;
                            } else {
                              delete conteoRefs.current[Number(r.id_detalle)];
                            }
                          }}
                          type="number"
                          step="0.0001"
                          min="0"
                          style={{
                            width: 110,
                          }}
                          value={r.cantidad_contada}
                          disabled={Boolean(r.confirmado_en)}
                          onChange={(e) =>
                            cambiar(
                              r.id_detalle,
                              "cantidad_contada",
                              e.target.value,
                            )
                          }
                          onKeyDown={(e) => manejarEnter(e, r.id_detalle)}
                        />
                      </td>

                      {/* DIFERENCIA */}

                      <td
                        style={{
                          textAlign: "right",

                          fontWeight: 700,
                        }}
                      >
                        {diff == null ? "" : diff.toLocaleString("es-AR")}
                      </td>

                      {/* MOTIVO */}

                      <td>
                        <select
                          value={r.motivo || ""}
                          disabled={Boolean(r.confirmado_en)}
                          onChange={(e) =>
                            cambiar(r.id_detalle, "motivo", e.target.value)
                          }
                          onKeyDown={(e) => manejarEnter(e, r.id_detalle)}
                          style={{
                            width: 220,
                          }}
                        >
                          <option value="">Sin motivo</option>

                          {motivos.map((motivo) => (
                            <option
                              key={motivo.id_motivo}
                              value={motivo.codigo}
                            >
                              {motivo.codigo} - {motivo.descripcion}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* OBSERVACIONES */}

                      <td>
                        <input
                          value={r.observaciones}
                          disabled={Boolean(r.confirmado_en)}
                          onChange={(e) =>
                            cambiar(
                              r.id_detalle,
                              "observaciones",
                              e.target.value,
                            )
                          }
                          onKeyDown={(e) => manejarEnter(e, r.id_detalle)}
                          style={{
                            width: 260,
                          }}
                        />
                      </td>

                      {/* ESTADO */}

                      <td>
                        {r.confirmado_en ? (
                          <span className="rc-badge ok">Confirmado</span>
                        ) : (
                          <span className="rc-badge warn">Pendiente</span>
                        )}
                      </td>

                      {/* AJUSTE */}

                      <td>{r.numero_ajuste || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

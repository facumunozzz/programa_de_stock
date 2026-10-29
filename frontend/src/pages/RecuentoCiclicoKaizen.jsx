import React, { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "react-toastify";

import api from "../api/axiosConfig";

import "../styles/recuentoCiclico.css";

import RecuentoCiclicoMotivos from "../components/RecuentoCiclicoMotivos";

// ======================================================
// HELPERS
// ======================================================

const pad2 = (valor) => String(valor).padStart(2, "0");

function mesActual() {
  const fecha = new Date();

  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}`;
}

function rangoDelMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ""))) {
    return {
      desde: "",
      hasta: "",
    };
  }

  const [anio, numeroMes] = mes.split("-").map(Number);

  const ultimoDia = new Date(anio, numeroMes, 0).getDate();

  return {
    desde: `${mes}-01`,

    hasta: `${mes}-${pad2(ultimoDia)}`,
  };
}

function porcentaje(valor) {
  const n = Number(valor);

  if (!Number.isFinite(n)) {
    return "-";
  }

  return `${n.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function numero(valor) {
  return Number(valor || 0).toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  });
}

// ======================================================
// COMPONENTE
// ======================================================

export default function RecuentoCiclicoKaizen() {
  const [mes, setMes] = useState(mesActual());

  const [depositos, setDepositos] = useState([]);

  const [depositoId, setDepositoId] = useState("");

  const [datos, setDatos] = useState(null);

  const [loading, setLoading] = useState(false);

  // ======================================================
  // DEPÓSITOS
  // ======================================================

  const cargarDepositos = useCallback(async () => {
    try {
      const response = await api.get("/depositos");

      setDepositos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error(error);

      toast.error("No se pudieron cargar los depósitos.");
    }
  }, []);

  // ======================================================
  // KAIZEN
  // ======================================================

  const cargarKaizen = useCallback(async () => {
    const { desde, hasta } = rangoDelMes(mes);

    if (!desde || !hasta) {
      return;
    }

    setLoading(true);

    try {
      const params = {
        desde,
        hasta,
      };

      if (depositoId) {
        params.deposito_id = Number(depositoId);
      }

      const response = await api.get("/recuento-ciclico/kaizen", {
        params,
      });

      setDatos(response.data);
    } catch (error) {
      console.error(error);

      setDatos(null);

      toast.error(
        error.response?.data?.detalle ||
          error.response?.data?.error ||
          "No se pudo generar el Kaizen.",
      );
    } finally {
      setLoading(false);
    }
  }, [mes, depositoId]);

  // ======================================================
  // INICIAL
  // ======================================================

  useEffect(() => {
    cargarDepositos();
  }, [cargarDepositos]);

  useEffect(() => {
    cargarKaizen();
  }, [cargarKaizen]);

  // ======================================================
  // DATOS
  // ======================================================

  const dias = useMemo(
    () => (Array.isArray(datos?.dias) ? datos.dias : []),
    [datos],
  );

  const motivos = useMemo(
    () => (Array.isArray(datos?.motivos) ? datos.motivos : []),
    [datos],
  );

  const resumen = datos?.resumen || {
    recuentos: 0,
    diferencias: 0,
    correctos: 0,
    eficiencia: null,
    motivos_informados: 0,
    diferencias_sin_motivo: 0,
  };

  // ======================================================
  // PORCENTAJES
  // ======================================================

  const porcentajeDiferencias =
    resumen.recuentos > 0
      ? (Number(resumen.diferencias || 0) / Number(resumen.recuentos)) * 100
      : null;

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <div className="rc-page rc-kaizen-page">
      {/* ============================================== */}
      {/* TÍTULO */}
      {/* ============================================== */}

      <div className="rc-kaizen-title-row">
        <div>
          <h2 className="module-title">KAIZEN DE RECUENTO CÍCLICO</h2>

          <div className="rc-kaizen-subtitle">
            Seguimiento diario de confiabilidad del inventario
          </div>
        </div>
      </div>

      {/* ============================================== */}
      {/* FILTROS */}
      {/* ============================================== */}

      <div className="rc-toolbar rc-no-print">
        <label className="rc-field">
          Mes
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </label>

        <label className="rc-field">
          Central / depósito
          <select
            value={depositoId}
            onChange={(e) => setDepositoId(e.target.value)}
          >
            <option value="">Todos</option>

            {depositos.map((deposito) => (
              <option key={deposito.id_deposito} value={deposito.id_deposito}>
                {deposito.nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="rc-btn"
          onClick={cargarKaizen}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* ============================================== */}
      {/* KPIS */}
      {/* ============================================== */}

      <div className="rc-kaizen-kpis">
        <div className="rc-kaizen-kpi">
          <span className="rc-kaizen-kpi-label">PRODUCTOS CONTABILIZADOS</span>

          <strong>{numero(resumen.recuentos)}</strong>
        </div>

        <div className="rc-kaizen-kpi">
          <span className="rc-kaizen-kpi-label">DIFERENCIAS ENCONTRADAS</span>

          <strong>{numero(resumen.diferencias)}</strong>
        </div>

        <div className="rc-kaizen-kpi">
          <span className="rc-kaizen-kpi-label">CONTEOS CORRECTOS</span>

          <strong>{numero(resumen.correctos)}</strong>
        </div>

        <div className="rc-kaizen-kpi rc-kaizen-kpi-eficiencia">
          <span className="rc-kaizen-kpi-label">TOTAL EFICIENCIA</span>

          <strong>{porcentaje(resumen.eficiencia)}</strong>
        </div>
      </div>

      {/* ============================================== */}
      {/* CUADRO KAIZEN UNIFICADO */}
      {/* ============================================== */}

      <section className="rc-kaizen-section">
        <h3>Resultado diario</h3>

        <div className="rc-kaizen-scroll">
          <table className="rc-table rc-kaizen-table rc-kaizen-unificada">
            {/* ======================================== */}
            {/* CABECERA */}
            {/* ======================================== */}

            <thead>
              <tr>
                <th className="rc-kaizen-concepto">Concepto</th>

                {dias.map((dia) => (
                  <th key={dia.fecha} title={dia.fecha}>
                    {pad2(dia.dia)}
                  </th>
                ))}

                <th className="rc-kaizen-total">TOTAL</th>

                <th className="rc-kaizen-porcentaje">%</th>
              </tr>
            </thead>

            <tbody>
              <tr className="rc-kaizen-principal">
                <td className="rc-kaizen-concepto">PRODUCTOS CONTABILIZADOS</td>

                {dias.map((dia) => (
                  <td key={`rec-${dia.fecha}`}>{dia.recuentos || ""}</td>
                ))}

                <td className="rc-kaizen-total">{numero(resumen.recuentos)}</td>

                <td>{resumen.recuentos > 0 ? "100,0%" : ""}</td>
              </tr>

              <tr className="rc-kaizen-diferencias-total">
                <td className="rc-kaizen-concepto">DIFERENCIAS ENCONTRADAS</td>

                {dias.map((dia) => (
                  <td key={`dif-${dia.fecha}`}>{dia.diferencias || ""}</td>
                ))}

                <td className="rc-kaizen-total">
                  {numero(resumen.diferencias)}
                </td>

                <td>
                  {porcentajeDiferencias != null
                    ? porcentaje(porcentajeDiferencias)
                    : ""}
                </td>
              </tr>

              {motivos.map((motivo) => (
                <tr
                  key={motivo.key ?? motivo.id_motivo ?? motivo.codigo}
                  className="rc-kaizen-motivo-row"
                >

                  <td className="rc-kaizen-concepto rc-kaizen-concepto-motivo">
                    <span className="rc-kaizen-motivo-codigo">
                      {motivo.codigo}
                    </span>

                    {" - "}

                    <span>{motivo.descripcion || motivo.codigo}</span>
                  </td>

                  {dias.map((dia) => (
                    <td key={`${motivo.key ?? motivo.codigo}-${dia.fecha}`}>
                      {motivo.dias?.[dia.fecha] || ""}
                    </td>
                  ))}

                  <td className="rc-kaizen-total">{motivo.total || ""}</td>

                  <td>
                    {Number(motivo.total || 0) > 0
                      ? porcentaje(motivo.porcentaje)
                      : ""}
                  </td>
                </tr>
              ))}

              {Number(resumen.diferencias_sin_motivo || 0) > 0 && (
                <tr className="rc-kaizen-sin-motivo">
                  <td className="rc-kaizen-concepto rc-kaizen-concepto-motivo">
                    SIN MOTIVO INFORMADO
                  </td>

                  {dias.map((dia) => (
                    <td key={`sin-${dia.fecha}`} />
                  ))}

                  <td className="rc-kaizen-total">
                    {numero(resumen.diferencias_sin_motivo)}
                  </td>

                  <td>
                    {resumen.recuentos > 0
                      ? porcentaje(
                          (Number(resumen.diferencias_sin_motivo || 0) /
                            Number(resumen.recuentos)) *
                            100,
                        )
                      : ""}
                  </td>
                </tr>
              )}

              <tr className="rc-kaizen-eficiencia-row">
                <td className="rc-kaizen-concepto">EFICIENCIA</td>

                {dias.map((dia) => (
                  <td key={`efi-${dia.fecha}`}>
                    {dia.recuentos > 0 ? porcentaje(dia.eficiencia) : ""}
                  </td>
                ))}

                <td className="rc-kaizen-total">
                  {porcentaje(resumen.eficiencia)}
                </td>

                <td>{porcentaje(resumen.eficiencia)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {!loading && Number(resumen.recuentos || 0) === 0 && (
        <div className="rc-kaizen-empty">
          No hay recuentos registrados para el período y depósito seleccionados.
        </div>
      )}

      <RecuentoCiclicoMotivos onChanged={cargarKaizen} />
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../api/axiosConfig";
import "../styles/recuentoCiclico.css";

const inicioMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function RecuentoCiclicoTransacciones() {
  const [rows, setRows] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [codigo, setCodigo] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [loading, setLoading] = useState(false);

  const cargarDepositos = async () => {
    try {
      const r = await api.get("/depositos");
      setDepositos(Array.isArray(r.data) ? r.data : []);
    } catch (e) { console.error(e); }
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const r = await api.get("/recuento-ciclico/transacciones", {
        params: {
          desde: desde || undefined,
          hasta: hasta || undefined,
          codigo: codigo || undefined,
          deposito_id: depositoId || undefined,
        },
      });
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error(e.response?.data?.error || "No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDepositos(); cargar(); }, []);

  const total = rows.length;
  const ajustados = rows.filter((r) => Math.abs(Number(r.ajuste_aplicado || 0)) > 0.000001).length;
  const confiabilidad = total ? ((total - ajustados) / total) * 100 : 100;

  return (
    <div className="rc-page">
      <h2 className="module-title">TRANSACCIONES DE RECUENTO CÍCLICO</h2>

      <div className="rc-toolbar rc-no-print">
        <label className="rc-field">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="rc-field">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <label className="rc-field">Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
        <label className="rc-field">Central
          <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
            <option value="">Todas</option>
            {depositos.map((d) => <option key={d.id_deposito} value={d.id_deposito}>{d.nombre}</option>)}
          </select>
        </label>
        <button className="rc-btn" onClick={cargar} disabled={loading}>Buscar</button>
      </div>

      <div className="rc-card rc-summary">
        <span>Recuentos: <b>{total}</b></span>
        <span>Con ajuste: <b>{ajustados}</b></span>
        <span>Sin ajuste: <b>{total - ajustados}</b></span>
        <span>Confiabilidad: <b>{confiabilidad.toFixed(1)}%</b></span>
      </div>

      <div className="rc-scroll">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Recuento</th><th>Código</th><th>Descripción</th><th>Central</th>
              <th>Stock teórico</th><th>Stock al confirmar</th><th>Contado</th><th>Diferencia recuento</th>
              <th>Ajuste aplicado</th><th>Usuario</th><th>Motivo</th><th>Observaciones</th><th>Ajuste ERP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id_transaccion} className={Math.abs(Number(r.diferencia_recuento || 0)) > 0.000001 ? "rc-row-diff" : ""}>
                <td>{r.fecha ? new Date(r.fecha).toLocaleString("es-AR") : ""}</td>
                <td>#{r.id_recuento}</td>
                <td>{r.codigo}</td>
                <td className="descripcion">{r.descripcion}</td>
                <td>{r.deposito}</td>
                <td>{Number(r.stock_teorico || 0).toLocaleString("es-AR")}</td>
                <td>{Number(r.stock_actual_confirmacion || 0).toLocaleString("es-AR")}</td>
                <td>{Number(r.cantidad_contada || 0).toLocaleString("es-AR")}</td>
                <td><b>{Number(r.diferencia_recuento || 0).toLocaleString("es-AR")}</b></td>
                <td>{Number(r.ajuste_aplicado || 0).toLocaleString("es-AR")}</td>
                <td>{r.usuario || "-"}</td>
                <td>{r.motivo || "-"}</td>
                <td className="descripcion">{r.observaciones || "-"}</td>
                <td>{r.numero_ajuste || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

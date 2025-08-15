import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function NuevoAjuste() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState("");

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState(""); // puede ser negativa

  const [motivo, setMotivo] = useState("");
  const [items, setItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDepositos, setErrorDepositos] = useState("");

  const bloqueadoCabecera = items.length > 0;

  useEffect(() => {
    api.get("/depositos")
      .then((res) => {
        setDepositos(res.data || []);
        setErrorDepositos("");
      })
      .catch((err) => {
        console.error(err);
        setErrorDepositos("No se pudo cargar la lista de depósitos.");
      });
  }, []);

  useEffect(() => {
    const c = (codigo || "").trim();
    if (!c) {
      setDescripcion("");
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/articulos/codigo/${c}`);
        const desc = res.data?.descripcion;
        setDescripcion(desc ? desc : "Artículo no encontrado");
      } catch {
        setDescripcion("Artículo no encontrado");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [codigo]);

  const cargarYContinuar = () => {
    setErrorMsg("");

    const dId = Number(depositoId);
    if (!dId) return setErrorMsg("Seleccioná el DEPÓSITO.");

    const c = (codigo || "").trim().toUpperCase();
    const q = Number(cantidad);
    if (!c) return setErrorMsg("Ingresá el CÓDIGO.");
    if (!Number.isFinite(q) || q === 0) return setErrorMsg("La CANTIDAD no puede ser 0 (puede ser negativa o positiva).");

    setItems((prev) => [
      ...prev,
      { cod_articulo: c, descripcion: descripcion || "", cantidad: q },
    ]);

    setCodigo("");
    setDescripcion("");
    setCantidad("");
  };

  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");

      const dId = Number(depositoId);
      if (!dId) return setErrorMsg("Seleccioná el DEPÓSITO.");
      if (items.length === 0) return setErrorMsg('Agregá ítems con "Cargar y continuar".');

      const body = {
        deposito_id: dId,
        motivo: motivo || null,
        items: items.map((it) => ({
          cod_articulo: it.cod_articulo,
          cantidad: it.cantidad,
        })),
      };

      const res = await api.post("/ajustes", body);
      alert(
        "Ajuste creado: " +
          (res.data?.ajuste?.numero_ajuste ||
            res.data?.message ||
            "OK")
      );
      navigate("/ajustes");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al confirmar el ajuste";
      setErrorMsg(msg);
    }
  };

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nuevo Ajuste</h2>
        <button className="nt-volver" onClick={() => navigate("/ajustes")}>
          ← Volver
        </button>
      </div>

      {errorDepositos && <div className="nt-error">{errorDepositos}</div>}
      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Origen (Depósito)</label>
            <select
              value={depositoId}
              onChange={(e) => setDepositoId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná depósito --</option>
              {depositos.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field grow">
            <label>Motivo</label>
            <input
              type="text"
              value={motivo}
              placeholder="Escribí el motivo del ajuste…"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <div className="nt-row">
          <div className="nt-field">
            <label>Código</label>
            <input
              type="text"
              value={codigo}
              placeholder="Ingresá código…"
              onChange={(e) => setCodigo(e.target.value)}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input
              type="text"
              value={descripcion}
              readOnly
              placeholder="Se completa desde el código"
            />
          </div>

          <div className="nt-field small">
            <label>Cantidad (+/-)</label>
            <input
              type="number"
              step="1"
              value={cantidad}
              onChange={(e) => {
                // permito negativos y positivos, solo enteros
                const v = e.target.value;
                if (/^-?\d*$/.test(v)) setCantidad(v);
              }}
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={cargarYContinuar}>
              Cargar y continuar
            </button>
            <button
              className="btn-primary"
              onClick={confirmar}
              disabled={!depositoId || items.length === 0}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>Ítems cargados</h4>
        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="4">No hay ítems. Usá "Cargar y continuar".</td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.cod_articulo}</td>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: "right" }}>{it.cantidad}</td>
                    <td>
                      <button className="borrar-btn" onClick={() => quitarItem(idx)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// frontend/src/pages/NuevaTransferencia.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./transferencias.css";

export default function NuevaTransferencia() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");

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

  const grabarYContinuar = () => {
    setErrorMsg("");

    const oId = Number(origenId);
    const dId = Number(destinoId);

    if (!oId || !dId) return setErrorMsg("Seleccioná ORIGEN y DESTINO.");
    if (oId === dId) return setErrorMsg("Origen y destino no pueden ser iguales.");

    const c = (codigo || "").trim().toUpperCase();
    const q = Number(cantidad);
    if (!c) return setErrorMsg("Ingresá el CÓDIGO.");
    if (!q || q <= 0) return setErrorMsg("La CANTIDAD debe ser mayor que 0.");

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

      const oId = Number(origenId);
      const dId = Number(destinoId);
      if (!oId || !dId) return setErrorMsg("Seleccioná ORIGEN y DESTINO.");
      if (items.length === 0) return setErrorMsg('Agregá ítems con "Grabar y continuar".');

      const body = {
        origen_id: oId,
        destino_id: dId,
        items: items.map((it) => ({
          cod_articulo: it.cod_articulo,
          cantidad: it.cantidad,
        })),
      };

      const res = await api.post("/transferencias", body);
      alert(
        "Transferencia creada: " +
          (res.data?.transferencia?.numero_transferencia ||
            res.data?.message ||
            "OK")
      );
      navigate("/transferencias");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al confirmar la transferencia";
      setErrorMsg(msg);
    }
  };

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2>Nueva Transferencia</h2>
        <button className="nt-volver" onClick={() => navigate("/transferencias")}>
          ← Volver
        </button>
      </div>

      {errorDepositos && <div className="nt-error">{errorDepositos}</div>}
      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Origen</label>
            <select
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná depósito origen --</option>
              {depositos.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Destino</label>
            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná depósito destino --</option>
              {depositos.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
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
            <label>Cantidad</label>
            <input
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) =>
                setCantidad(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={grabarYContinuar}>
              Grabar y continuar
            </button>
            <button
              className="btn-primary"
              onClick={confirmar}
              disabled={!origenId || !destinoId || items.length === 0}
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
                  <td colSpan="4">No hay ítems. Usá "Grabar y continuar".</td>
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

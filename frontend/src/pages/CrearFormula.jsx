import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function CrearFormula() {
  const navigate = useNavigate();

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [verificado, setVerificado] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [matCodigo, setMatCodigo] = useState("");
  const [matDescripcion, setMatDescripcion] = useState("");
  const [matCantidad, setMatCantidad] = useState("");

  const [items, setItems] = useState([]);

  const normalizarNumero = (valor) => {
    return String(valor ?? "").replace(",", ".");
  };

  const permitirDecimalPositivo = (valor) => {
    const v = String(valor ?? "").replace(",", ".");
    if (/^\d*\.?\d*$/.test(v)) {
      setMatCantidad(v);
    }
  };

  function useDebounce(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value, delay]);

    return debounced;
  }

  const debouncedMatCodigo = useDebounce(matCodigo, 250);

  useEffect(() => {
    const c = (debouncedMatCodigo || "").trim();

    if (!c) {
      setMatDescripcion("");
      return;
    }

    let cancel = false;

    (async () => {
      try {
        const res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);
        if (!cancel) setMatDescripcion(res.data?.descripcion || "");
      } catch {
        if (!cancel) setMatDescripcion("");
      }
    })();

    return () => {
      cancel = true;
    };
  }, [debouncedMatCodigo]);

  const verificarCodigo = async () => {
    setErrorMsg("");

    const c = (codigo || "").trim().toUpperCase();
    if (!c) return setErrorMsg("Ingresá un código para verificar.");

    try {
      const res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);
      setCodigo(c);
      setDescripcion(res.data?.descripcion || "");
      setVerificado(true);
    } catch {
      const ir = window.confirm(
        "El código NO existe. ¿Querés ir a Artículos para crearlo?"
      );
      if (ir) navigate("/articulos");
    }
  };

  const agregarItem = () => {
    setErrorMsg("");

    const cod = (matCodigo || "").trim().toUpperCase();
    const cant = Number(normalizarNumero(matCantidad));

    if (!cod) return setErrorMsg("Ingresá el código del material.");
    if (!Number.isFinite(cant) || cant <= 0) {
      return setErrorMsg("La cantidad debe ser mayor que 0. Puede ser decimal.");
    }

    setItems((prev) => {
      const ix = prev.findIndex((it) => it.cod_articulo === cod);

      if (ix === -1) {
        return [
          ...prev,
          {
            cod_articulo: cod,
            descripcion: matDescripcion || "",
            cantidad: cant,
          },
        ];
      }

      const copy = [...prev];
      copy[ix] = {
        ...copy[ix],
        cantidad: Number(copy[ix].cantidad) + cant,
      };
      return copy;
    });

    setMatCodigo("");
    setMatDescripcion("");
    setMatCantidad("");
  };

  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");

      const c = (codigo || "").trim().toUpperCase();

      if (!verificado) return setErrorMsg("Primero verificá que el código exista.");
      if (!c) return setErrorMsg("Código inválido.");
      if (items.length === 0) {
        return setErrorMsg('Agregá materiales con "Cargar y continuar".');
      }

      const body = {
        codigo: c,
        items: items.map((it) => ({
          cod_articulo: String(it.cod_articulo || "").trim().toUpperCase(),
          cantidad: Number(it.cantidad),
        })),
      };

      const res = await api.post("/produccion/formulas", body);

      alert(res.data?.message || "Fórmula creada correctamente.");
      navigate("/produccion");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al crear la fórmula";
      setErrorMsg(msg);
    }
  };

  const puedeConfirmar = useMemo(
    () => verificado && codigo.trim() && items.length > 0,
    [verificado, codigo, items.length]
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Crear fórmula</h2>
        <button className="nt-volver" onClick={() => navigate("/produccion")}>
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Código (producto)</label>
            <input
              type="text"
              placeholder="Código del producto…"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setVerificado(false);
                setDescripcion("");
              }}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input
              type="text"
              value={descripcion}
              readOnly
              placeholder="Se completa al verificar"
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={verificarCodigo}>
              Verificar
            </button>
          </div>
        </div>
      </div>

      {verificado && (
        <>
          <div className="nt-card">
            <h4>Materiales</h4>

            <div className="nt-row">
              <div className="nt-field">
                <label>Ingrese un material (código)</label>
                <input
                  type="text"
                  placeholder="Código material…"
                  value={matCodigo}
                  onChange={(e) => setMatCodigo(e.target.value)}
                />
              </div>

              <div className="nt-field">
                <label>Descripción</label>
                <input
                  type="text"
                  value={matDescripcion}
                  readOnly
                  placeholder="Se completa desde el código"
                />
              </div>

              <div className="nt-field small">
                <label>Cantidad</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={matCantidad}
                  placeholder="Ej: 0.25"
                  onChange={(e) => permitirDecimalPositivo(e.target.value)}
                />
              </div>

              <div className="nt-actions">
                <button className="btn-light" onClick={agregarItem}>
                  Cargar y continuar
                </button>

                <button
                  className="btn-primary"
                  onClick={confirmar}
                  disabled={!puedeConfirmar}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>

          <div className="nt-card">
            <h4>Materiales cargados</h4>

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
                      <td colSpan="4">
                        No hay materiales. Usá "Cargar y continuar".
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr key={idx}>
                        <td>{it.cod_articulo}</td>
                        <td>{it.descripcion}</td>
                        <td style={{ textAlign: "right" }}>{it.cantidad}</td>
                        <td>
                          <button
                            className="borrar-btn"
                            onClick={() => quitarItem(idx)}
                          >
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
        </>
      )}
    </div>
  );
}
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function EditarFormula() {
  const navigate = useNavigate();

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [items, setItems] = useState([]);

  const [matCodigo, setMatCodigo] = useState("");
  const [matDescripcion, setMatDescripcion] = useState("");
  const [matCantidad, setMatCantidad] = useState("");

  const normalizarNumero = (valor) => {
    return String(valor ?? "").replace(",", ".");
  };

  const permitirDecimalPositivo = (valor, setter) => {
    const v = String(valor ?? "").replace(",", ".");
    if (/^\d*\.?\d*$/.test(v)) {
      setter(v);
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

  const buscarFormula = async () => {
    setErrorMsg("");
    setItems([]);
    setDescripcion("");

    const c = (codigo || "").trim().toUpperCase();
    if (!c) return setErrorMsg("Ingresá un código de producto.");

    try {
      setCargando(true);

      const res = await api.get(`/produccion/formulas/${encodeURIComponent(c)}`);

      const prodDesc =
        res.data?.producto?.descripcion ?? res.data?.descripcion ?? "";

      const detalle = res.data?.detalle ?? res.data?.componentes ?? [];

      setDescripcion(prodDesc || "");

      setItems(
        (detalle || []).map((d) => ({
          cod_articulo: d.cod_articulo,
          descripcion: d.descripcion ?? "",
          cantidad: Number(d.cantidad) || 0,
        }))
      );

      if ((detalle || []).length === 0) {
        setErrorMsg("No existe fórmula para este código");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err.message ||
        "Error al obtener la fórmula";
      setErrorMsg(msg);
    } finally {
      setCargando(false);
    }
  };

  const cargarYContinuar = () => {
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

  const editarCantidad = (idx, value) => {
    const v = String(value ?? "").replace(",", ".");

    if (!/^\d*\.?\d*$/.test(v)) return;

    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        cantidad: v,
      };
      return copy;
    });
  };

  const guardarCambios = async () => {
    try {
      setErrorMsg("");

      const c = (codigo || "").trim().toUpperCase();

      if (!c) return setErrorMsg("Ingresá un código de producto.");
      if (items.length === 0) {
        return setErrorMsg('Agregá materiales con "Cargar y continuar".');
      }

      const itemsNormalizados = items.map((it) => ({
        cod_articulo: it.cod_articulo,
        cantidad: Number(normalizarNumero(it.cantidad)),
      }));

      if (
        itemsNormalizados.some(
          (it) => !Number.isFinite(it.cantidad) || it.cantidad <= 0
        )
      ) {
        return setErrorMsg("Todas las cantidades deben ser mayores que 0.");
      }

      const body = {
        items: itemsNormalizados,
      };

      await api.put(`/produccion/formulas/${encodeURIComponent(c)}`, body);

      alert("Fórmula actualizada correctamente.");
      navigate("/produccion");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detalle ||
        err.message ||
        "Error al actualizar la fórmula";
      setErrorMsg(msg);
    }
  };

  const puedeGuardar = useMemo(
    () =>
      (codigo || "").trim() &&
      items.length > 0 &&
      items.every((i) => {
        const n = Number(normalizarNumero(i.cantidad));
        return Number.isFinite(n) && n > 0;
      }),
    [codigo, items]
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Editar fórmula</h2>

        <button className="nt-volver" onClick={() => navigate("/produccion")}>
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Código producto</label>
            <input
              type="text"
              placeholder="Código de producto…"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setDescripcion("");
                setItems([]);
                setErrorMsg("");
              }}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input
              type="text"
              value={descripcion}
              readOnly
              placeholder="Se completa al buscar fórmula"
            />
          </div>

          <div className="nt-actions">
            <button
              className="btn-light"
              onClick={buscarFormula}
              disabled={cargando}
            >
              {cargando ? "Buscando…" : "Buscar fórmula"}
            </button>
          </div>
        </div>
      </div>

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
              disabled={!descripcion}
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
              onChange={(e) =>
                permitirDecimalPositivo(e.target.value, setMatCantidad)
              }
            />
          </div>

          <div className="nt-actions">
            <button
              className="btn-light"
              onClick={cargarYContinuar}
              disabled={!descripcion}
            >
              Cargar y continuar
            </button>

            <button
              className="btn-primary"
              onClick={guardarCambios}
              disabled={!puedeGuardar}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>

      <div className="nt-card">
        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right", width: 120 }}>Cantidad</th>
                <th style={{ width: 100 }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    No hay materiales. Cargá con “Cargar y continuar”.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.cod_articulo}</td>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={it.cantidad}
                        onChange={(e) => editarCantidad(idx, e.target.value)}
                        style={{ width: 90, textAlign: "right" }}
                      />
                    </td>
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
    </div>
  );
}
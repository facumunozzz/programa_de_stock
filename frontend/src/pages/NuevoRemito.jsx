import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/nuevoRemito.css";
import logoAquatic from "../images/logo-aquatic.png";

export default function NuevoRemito() {
  const navigate = useNavigate();

  const [fecha] = useState(new Date());
  const [numeroRemito, setNumeroRemito] = useState("");

  const [proveedores, setProveedores] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [articulosActivos, setArticulosActivos] = useState([]);

  const [proveedorId, setProveedorId] = useState("");
  const [tipo, setTipo] = useState("EGRESO");
  const [codigoMaterial, setCodigoMaterial] = useState("");
  const [descripcionMaterial, setDescripcionMaterial] = useState("");
  const [cantidadPadre, setCantidadPadre] = useState("");
  const [cantidadBultos, setCantidadBultos] = useState("");

  const [items, setItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    cargarInicial();
  }, []);

  const normalizarArray = (data, key) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.[key])) return data[key];
    if (Array.isArray(data?.recordset)) return data.recordset;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  const toNumber = (v) => Number(String(v ?? "").replace(",", "."));

  const cargarInicial = async () => {
    try {
      const [provRes, depRes, nroRes, artRes] = await Promise.all([
        api.get("/remito-proveedores"),
        api.get("/depositos"),
        api.get("/remitos/proximo-numero"),
        api.get("/remitos/articulos-activos"),
      ]);

      setProveedores(normalizarArray(provRes.data, "proveedores"));
      setDepositos(normalizarArray(depRes.data, "depositos"));
      setNumeroRemito(nroRes.data?.numero_remito || "");
      setArticulosActivos(normalizarArray(artRes.data, "articulos"));
    } catch (err) {
      console.error(err);
      setErrorMsg("Error cargando datos iniciales.");
    }
  };

  const buscarMaterial = async () => {
    try {
      setErrorMsg("");

      const codigo = codigoMaterial.trim().toUpperCase();
      const cantPadre = toNumber(cantidadPadre);

      if (!codigo) {
        return setErrorMsg("Seleccioná un artículo a enviar.");
      }

      if (!Number.isFinite(cantPadre) || cantPadre <= 0) {
        return setErrorMsg("Ingresá la cantidad del producto padre.");
      }

      const res = await api.get(
        `/remitos/articulos/${encodeURIComponent(codigo)}/materiales?cantidad=${cantPadre}`,
      );

      const prodDesc = res.data?.producto?.descripcion || "";
      const detalle = res.data?.detalle || [];

      if (!detalle.length) {
        setDescripcionMaterial(prodDesc);
        return setErrorMsg(
          "Ese artículo no tiene materiales cargados en la fórmula.",
        );
      }

      setDescripcionMaterial(prodDesc);

      const nuevosItems = detalle.map((d) => ({
        codigo: d.codigo,
        descripcion: d.descripcion || "",
        bultos: "",
        cantidad: Number(d.cantidad_total || 0),
        um: "",
        control: "",
        observaciones: "",
        deposito_id: "",
      }));

      setItems((prev) => {
        const mapa = new Map();

        // Primero cargo lo que ya estaba
        for (const item of prev) {
          const key = String(item.codigo || "")
            .trim()
            .toUpperCase();

          if (!key) continue;

          mapa.set(key, {
            ...item,
            codigo: key,
            cantidad: toNumber(item.cantidad || 0),
          });
        }

        // Después agrego lo nuevo o sumo si ya existía
        for (const nuevo of nuevosItems) {
          const key = String(nuevo.codigo || "")
            .trim()
            .toUpperCase();

          if (!key) continue;

          if (mapa.has(key)) {
            const existente = mapa.get(key);

            mapa.set(key, {
              ...existente,
              cantidad:
                toNumber(existente.cantidad || 0) +
                toNumber(nuevo.cantidad || 0),
            });
          } else {
            mapa.set(key, nuevo);
          }
        }

        return Array.from(mapa.values());
      });
    } catch (err) {
      console.error(err);
      setDescripcionMaterial("");
      setErrorMsg(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo obtener la fórmula del artículo.",
      );
    }
  };

  const actualizarItem = (idx, campo, valor) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [campo]: valor };
      return copy;
    });
  };

  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const proveedorSeleccionado = useMemo(() => {
    return proveedores.find(
      (p) => Number(p.id_proveedor) === Number(proveedorId),
    );
  }, [proveedores, proveedorId]);

  const guardarRemito = async () => {
    try {
      setErrorMsg("");

      if (!proveedorId) return setErrorMsg("Seleccioná un proveedor.");
      if (!codigoMaterial.trim())
        return setErrorMsg("Indicá el material a enviar.");
      if (!items.length) return setErrorMsg("No hay materiales cargados.");
      if (!cantidadBultos || toNumber(cantidadBultos) <= 0) {
        return setErrorMsg("Indicá una cantidad de bultos válida.");
      }

      const itemsNormalizados = items.map((it) => ({
        codigo: it.codigo,
        descripcion: it.descripcion,
        bultos: toNumber(it.bultos || 0),
        cantidad: toNumber(it.cantidad || 0),
        um: it.um || null,
        control: it.control || null,
        observaciones: it.observaciones || null,
        deposito_id: Number(it.deposito_id),
      }));

      if (itemsNormalizados.some((it) => !it.deposito_id)) {
        return setErrorMsg("Todos los ítems deben tener depósito.");
      }

      const body = {
        tipo,
        id_proveedor: Number(proveedorId),
        proveedor: proveedorSeleccionado?.nombre || "",
        material_codigo: codigoMaterial.trim().toUpperCase(),
        material_descripcion: descripcionMaterial,
        cantidad_padre: toNumber(cantidadPadre),
        cantidad_bultos: toNumber(cantidadBultos),
        items: itemsNormalizados,
      };

      const res = await api.post("/remitos", body);

      alert(
        `Remito guardado correctamente: ${res.data?.remito?.nro_remito || "OK"}`,
      );
      navigate("/remitos");
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al guardar remito.",
      );
    }
  };

  const imprimirRemito = () => {
    window.print();
  };

  return (
    <div className="nuevo-remito-page">
      <div className="remito-print-area">
        <h2 className="nuevo-remito-titulo">REMITO AUTOMÁTICO</h2>

        <div className="remito-top">
          <div>
            <h1 className="remito-label">REMITO</h1>
            <div className="remito-fecha">
              <b>FECHA:</b> {fecha.toLocaleDateString("es-AR")}
            </div>
          </div>

          <div className="remito-logo">
            <img src={logoAquatic} alt="Aquatic" />
          </div>

          <div className="remito-numero">{numeroRemito || "Generando..."}</div>
        </div>

        <div className="remito-botones no-print">
          <button onClick={imprimirRemito}>IMPRIMIR REMITO</button>
          <button onClick={guardarRemito}>GUARDAR REMITO</button>
          <button className="danger" onClick={() => navigate("/remitos")}>
            CANCELAR REMITO
          </button>
        </div>

        {errorMsg && <div className="remito-error no-print">{errorMsg}</div>}

        <div className="remito-form-grid">
          <div className="remito-campo proveedor">
            <label>NOMBRE PROVEEDOR</label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
            >
              <option value="">-- Seleccionar proveedor --</option>
              {proveedores.map((p) => (
                <option key={p.id_proveedor} value={p.id_proveedor}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="remito-campo bultos">
            <label>CANT DE BULTOS</label>
            <input
              type="number"
              min="1"
              value={cantidadBultos}
              onChange={(e) => setCantidadBultos(e.target.value)}
            />
          </div>

          <div className="remito-campo material">
            <label>MATERIAL A ENVIAR</label>
            <div className="material-line">
              <select
                value={codigoMaterial}
                onChange={(e) => {
                  const codigo = e.target.value;
                  setCodigoMaterial(codigo);

                  const art = articulosActivos.find(
                    (a) =>
                      String(a.cod_articulo).toUpperCase() ===
                      String(codigo).toUpperCase(),
                  );

                  setDescripcionMaterial(art?.descripcion || "");
                }}
                style={{
                  width: "280px",
                  minWidth: "280px",
                  maxWidth: "280px",
                }}
              >
                <option value="">-- Seleccionar artículo --</option>

                {articulosActivos.map((a) => (
                  <option key={a.id_articulo} value={a.cod_articulo}>
                    {a.cod_articulo} - {a.descripcion}
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                min="0"
                value={cantidadPadre}
                placeholder="Cantidad"
                onChange={(e) => setCantidadPadre(e.target.value)}
                style={{
                  width: "160px",
                  minWidth: "160px",
                  maxWidth: "160px",
                  textAlign: "center",
                }}
              />

              <button
                className="no-print"
                onClick={buscarMaterial}
                style={{
                  minWidth: "180px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                Cargar materiales
              </button>
            </div>
            <small>{descripcionMaterial}</small>
          </div>

          <div className="remito-campo tipo">
            <label>INGRESO / EGRESO</label>
            <button
              className={`switch-remito ${tipo === "INGRESO" ? "ingreso" : "egreso"}`}
              onClick={() => setTipo(tipo === "INGRESO" ? "EGRESO" : "INGRESO")}
            >
              {tipo}
            </button>
          </div>
        </div>

        <table className="remito-detalle-table">
          <thead>
            <tr>
              <th>#</th>
              <th>CÓDIGO</th>
              <th>DESCRIPCIÓN</th>
              <th>BULTOS</th>
              <th>CANTIDAD</th>
              <th>UM</th>
              <th>CONTROL</th>
              <th>OBSERVACIONES</th>
              <th className="no-print">ACCIONES</th>
              <th>DEPÓSITO {tipo}</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="10">
                  Cargá un material para ver sus componentes.
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{it.codigo}</td>
                  <td>{it.descripcion}</td>
                  <td>
                    <input
                      type="number"
                      value={it.bultos}
                      onChange={(e) =>
                        actualizarItem(idx, "bultos", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={it.cantidad}
                      onChange={(e) =>
                        actualizarItem(idx, "cantidad", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={it.um}
                      onChange={(e) =>
                        actualizarItem(idx, "um", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={it.control}
                      onChange={(e) =>
                        actualizarItem(idx, "control", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={it.observaciones}
                      onChange={(e) =>
                        actualizarItem(idx, "observaciones", e.target.value)
                      }
                    />
                  </td>
                  <td className="no-print">
                    <button onClick={() => quitarItem(idx)}>Eliminar</button>
                  </td>
                  <td>
                    <select
                      value={it.deposito_id}
                      onChange={(e) =>
                        actualizarItem(idx, "deposito_id", e.target.value)
                      }
                    >
                      <option value="">-- Depósito --</option>
                      {depositos.map((d) => (
                        <option key={d.id_deposito} value={d.id_deposito}>
                          {d.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

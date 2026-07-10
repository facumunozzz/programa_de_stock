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
  const [descripcionSeleccionada, setDescripcionSeleccionada] = useState("");
  const [variantesSeleccionadas, setVariantesSeleccionadas] = useState([]);

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

      if (!descripcionSeleccionada) {
        return setErrorMsg("Seleccioná una descripción.");
      }

      const variantesConCantidad = variantesSeleccionadas.filter((variante) => {
        const cantidad = toNumber(variante.cantidad);

        return Number.isFinite(cantidad) && cantidad > 0;
      });

      if (!variantesConCantidad.length) {
        return setErrorMsg(
          "Ingresá una cantidad en al menos uno de los talles.",
        );
      }

      const respuestas = await Promise.all(
        variantesConCantidad.map((variante) =>
          api.get(
            `/remitos/articulos/${encodeURIComponent(
              variante.cod_articulo,
            )}/materiales?cantidad=${toNumber(variante.cantidad)}`,
          ),
        ),
      );

      const mapaMateriales = new Map();

      for (const respuesta of respuestas) {
        const detalle = respuesta.data?.detalle || [];

        for (const material of detalle) {
          const codigo = String(material.codigo || "")
            .trim()
            .toUpperCase();

          if (!codigo) continue;

          const cantidadNueva = toNumber(material.cantidad_total || 0);

          if (mapaMateriales.has(codigo)) {
            const existente = mapaMateriales.get(codigo);

            mapaMateriales.set(codigo, {
              ...existente,
              cantidad: toNumber(existente.cantidad || 0) + cantidadNueva,
            });
          } else {
            mapaMateriales.set(codigo, {
              codigo,
              descripcion: material.descripcion || "",
              bultos: "",
              cantidad: cantidadNueva,
              um: "",
              control: "",
              observaciones: "",
              deposito_id: "",
            });
          }
        }
      }

      const materialesTotales = Array.from(mapaMateriales.values());

      if (!materialesTotales.length) {
        return setErrorMsg(
          "Los talles seleccionados no tienen materiales en sus fórmulas.",
        );
      }

      setItems(materialesTotales);
    } catch (err) {
      console.error(err);

      setErrorMsg(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudieron cargar los materiales.",
      );
    }
  };

  const cantidadBultos = useMemo(() => {
    return items.reduce((total, item) => {
      const bultos = toNumber(item.bultos || 0);

      return total + (Number.isFinite(bultos) ? bultos : 0);
    }, 0);
  }, [items]);

  const actualizarItem = (idx, campo, valor) => {
    setItems((prev) => {
      const copy = [...prev];

      copy[idx] = {
        ...copy[idx],
        [campo]: valor,
      };

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

  const articulosPorDescripcion = useMemo(() => {
    const mapa = new Map();

    for (const articulo of articulosActivos) {
      const descripcion = String(articulo.descripcion || "").trim();

      if (!descripcion) continue;

      const clave = descripcion.toUpperCase();

      if (!mapa.has(clave)) {
        mapa.set(clave, {
          descripcion,
          variantes: [],
        });
      }

      mapa.get(clave).variantes.push({
        id_articulo: articulo.id_articulo,
        cod_articulo: articulo.cod_articulo,
        cod_barra: articulo.cod_barra,
        talle: articulo.talle,
        color: articulo.color,
        cod_modelo: articulo.cod_modelo,
        cantidad: "",
      });
    }

    return Array.from(mapa.values()).sort((a, b) =>
      a.descripcion.localeCompare(b.descripcion, "es"),
    );
  }, [articulosActivos]);

  const seleccionarDescripcion = (descripcion) => {
    setDescripcionSeleccionada(descripcion);
    setItems([]);
    setErrorMsg("");

    if (!descripcion) {
      setVariantesSeleccionadas([]);
      return;
    }

    const grupo = articulosPorDescripcion.find(
      (g) =>
        String(g.descripcion).trim().toUpperCase() ===
        String(descripcion).trim().toUpperCase(),
    );

    setVariantesSeleccionadas(
      (grupo?.variantes || []).map((variante) => ({
        ...variante,
        cantidad: "",
      })),
    );
  };

  const actualizarCantidadVariante = (idx, valor) => {
    setVariantesSeleccionadas((prev) => {
      const copia = [...prev];

      copia[idx] = {
        ...copia[idx],
        cantidad: valor,
      };

      return copia;
    });

    setItems([]);
  };

  const guardarRemito = async () => {
    try {
      setErrorMsg("");

      if (!proveedorId) {
        return setErrorMsg("Seleccioná un proveedor.");
      }

      if (!descripcionSeleccionada) {
        return setErrorMsg("Seleccioná una descripción.");
      }

      const variantesConCantidad = variantesSeleccionadas.filter(
        (variante) => toNumber(variante.cantidad) > 0,
      );

      if (!variantesConCantidad.length) {
        return setErrorMsg("Ingresá una cantidad en al menos un talle.");
      }

      if (!items.length) {
        return setErrorMsg(
          "Presioná Cargar materiales antes de guardar el remito.",
        );
      }

      if (cantidadBultos <= 0) {
        return setErrorMsg(
          "Ingresá los bultos correspondientes en el detalle.",
        );
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

      const cantidadTotalProductos = variantesSeleccionadas.reduce(
        (total, variante) => {
          const cantidad = toNumber(variante.cantidad || 0);

          return total + (Number.isFinite(cantidad) ? cantidad : 0);
        },
        0,
      );

      const detalleVariantes = variantesSeleccionadas
        .filter((variante) => toNumber(variante.cantidad) > 0)
        .map((variante) => ({
          id_articulo: variante.id_articulo,
          codigo: variante.cod_articulo,
          cod_barra: variante.cod_barra,
          talle: variante.talle,
          color: variante.color,
          cantidad: toNumber(variante.cantidad),
        }));

      const body = {
        tipo,
        id_proveedor: Number(proveedorId),
        proveedor: proveedorSeleccionado?.nombre || "",

        material_codigo: detalleVariantes
          .map((variante) => variante.codigo)
          .join(", "),

        material_descripcion: descripcionSeleccionada,

        cantidad_padre: cantidadTotalProductos,
        cantidad_bultos: cantidadBultos,

        variantes: detalleVariantes,

        items: itemsNormalizados,
      };

      const res = await api.post("/remitos", body);

      alert(
        `Remito guardado correctamente: ${
          res.data?.remito?.nro_remito || "OK"
        }`,
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

            <input type="number" value={cantidadBultos} readOnly disabled />
          </div>

          <div className="remito-campo material">
            <label>MATERIAL A ENVIAR</label>

            <div className="material-line">
              <select
                value={descripcionSeleccionada}
                onChange={(e) => seleccionarDescripcion(e.target.value)}
                style={{
                  width: "420px",
                  minWidth: "420px",
                  maxWidth: "420px",
                }}
              >
                <option value="">-- Seleccionar descripción --</option>

                {articulosPorDescripcion.map((grupo) => (
                  <option key={grupo.descripcion} value={grupo.descripcion}>
                    {grupo.descripcion}
                  </option>
                ))}
              </select>
            </div>

            {variantesSeleccionadas.length > 0 && (
              <div className="variantes-remito">
                <table className="tabla-variantes-remito">
                  <thead>
                    <tr>
                      <th>TALLE</th>
                      <th>COLOR</th>
                      <th>CÓDIGO DE BARRAS</th>
                      <th>CÓDIGO ARTÍCULO</th>
                      <th>CANTIDAD</th>
                    </tr>
                  </thead>

                  <tbody>
                    {variantesSeleccionadas.map((variante, idx) => (
                      <tr key={variante.id_articulo}>
                        <td>{variante.talle || "-"}</td>
                        <td>{variante.color || "-"}</td>

                        <td>{variante.cod_barra || "-"}</td>

                        <td>{variante.cod_articulo}</td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={variante.cantidad}
                            onChange={(e) =>
                              actualizarCantidadVariante(idx, e.target.value)
                            }
                            style={{
                              width: "110px",
                              textAlign: "center",
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  type="button"
                  className="no-print"
                  onClick={buscarMaterial}
                  style={{
                    marginTop: "12px",
                    minWidth: "180px",
                    padding: "10px 18px",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Cargar materiales
                </button>
              </div>
            )}
          </div>

          <div className="remito-campo tipo">
            <label>INGRESO / EGRESO</label>

            <button
              className={`switch-remito ${
                tipo === "INGRESO" ? "ingreso" : "egreso"
              }`}
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

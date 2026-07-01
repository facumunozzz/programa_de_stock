import React, { useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import api from "../api/axiosConfig";

import "./../styles/transferencias.css";

function useDebounce(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function EditarFormula() {
  const navigate = useNavigate();

  /*
  |--------------------------------------------------------------------------
  | Producto
  |--------------------------------------------------------------------------
  */

  const [busquedaProducto, setBusquedaProducto] = useState("");

  const [codBarraProducto, setCodBarraProducto] = useState("");

  const [descripcionProducto, setDescripcionProducto] = useState("");

  const [formulaCargada, setFormulaCargada] = useState(false);

  const [buscandoFormula, setBuscandoFormula] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Material
  |--------------------------------------------------------------------------
  */

  const [busquedaMaterial, setBusquedaMaterial] = useState("");

  const [codBarraMaterial, setCodBarraMaterial] = useState("");

  const [descripcionMaterial, setDescripcionMaterial] = useState("");

  const [cantidadMaterial, setCantidadMaterial] = useState("");

  const [buscandoMaterial, setBuscandoMaterial] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Fórmula
  |--------------------------------------------------------------------------
  */

  const [items, setItems] = useState([]);

  const [errorMsg, setErrorMsg] = useState("");

  const [guardando, setGuardando] = useState(false);

  const busquedaMaterialDebounced = useDebounce(busquedaMaterial, 400);

  const normalizarNumero = (value) => {
    return String(value ?? "").replace(",", ".");
  };

  const permitirDecimalPositivo = (value, setter) => {
    const normalized = normalizarNumero(value);

    if (/^\d*\.?\d*$/.test(normalized)) {
      setter(normalized);
    }
  };

  const limpiarFormula = () => {
    setCodBarraProducto("");
    setDescripcionProducto("");
    setFormulaCargada(false);
    setItems([]);
  };

  const limpiarMaterial = () => {
    setBusquedaMaterial("");
    setCodBarraMaterial("");
    setDescripcionMaterial("");
    setCantidadMaterial("");
  };

  /*
  |--------------------------------------------------------------------------
  | Buscar automáticamente material
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const referencia = busquedaMaterialDebounced.trim();

    if (!referencia) {
      setCodBarraMaterial("");
      setDescripcionMaterial("");
      setBuscandoMaterial(false);
      return;
    }

    let cancelado = false;

    const buscarMaterial = async () => {
      try {
        setBuscandoMaterial(true);

        const response = await api.get(
          `/articulos/referencia/${encodeURIComponent(referencia)}`,
        );

        if (cancelado) return;

        const articulo = response.data || {};

        setCodBarraMaterial(articulo.cod_barra || "");

        setDescripcionMaterial(articulo.descripcion || "");
      } catch {
        if (cancelado) return;

        setCodBarraMaterial("");
        setDescripcionMaterial("");
      } finally {
        if (!cancelado) {
          setBuscandoMaterial(false);
        }
      }
    };

    buscarMaterial();

    return () => {
      cancelado = true;
    };
  }, [busquedaMaterialDebounced]);

  /*
  |--------------------------------------------------------------------------
  | Buscar producto y fórmula
  |--------------------------------------------------------------------------
  */

  const buscarFormula = async () => {
    setErrorMsg("");
    limpiarFormula();

    const referencia = busquedaProducto.trim();

    if (!referencia) {
      return setErrorMsg("Ingresá un código de barras o una descripción.");
    }

    try {
      setBuscandoFormula(true);

      /*
      |--------------------------------------------------------------------------
      | Resolver producto por código de barras o descripción
      |--------------------------------------------------------------------------
      */

      const articuloResponse = await api.get(
        `/articulos/referencia/${encodeURIComponent(referencia)}`,
      );

      const articulo = articuloResponse.data || {};

      if (!articulo.cod_barra) {
        return setErrorMsg("El artículo encontrado no tiene código de barras.");
      }

      const codBarra = String(articulo.cod_barra);

      /*
      |--------------------------------------------------------------------------
      | Buscar fórmula por código de barras
      |--------------------------------------------------------------------------
      */

      const formulaResponse = await api.get(
        `/produccion/formulas/${encodeURIComponent(codBarra)}`,
      );

      const producto = formulaResponse.data?.producto || articulo;

      const detalle = formulaResponse.data?.detalle || [];

      setCodBarraProducto(producto.cod_barra || codBarra);

      setDescripcionProducto(
        producto.descripcion || articulo.descripcion || "",
      );

      setBusquedaProducto(
        producto.descripcion || articulo.descripcion || codBarra,
      );

      setItems(
        detalle.map((item) => ({
          cod_barra: item.cod_barra || "",
          descripcion: item.descripcion || "",
          cantidad: Number(item.cantidad) || 0,
        })),
      );

      if (!detalle.length) {
        setFormulaCargada(false);

        return setErrorMsg(
          "El producto existe, pero no tiene una fórmula creada.",
        );
      }

      setFormulaCargada(true);
    } catch (error) {
      limpiarFormula();

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        "Error al obtener la fórmula.";

      setErrorMsg(mensaje);
    } finally {
      setBuscandoFormula(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Agregar material
  |--------------------------------------------------------------------------
  */

  const cargarYContinuar = () => {
    setErrorMsg("");

    const codBarra = codBarraMaterial.trim().toUpperCase();

    const cantidad = Number(normalizarNumero(cantidadMaterial));

    if (!formulaCargada) {
      return setErrorMsg("Primero buscá una fórmula existente.");
    }

    if (!busquedaMaterial.trim()) {
      return setErrorMsg(
        "Ingresá el código de barras o la descripción del material.",
      );
    }

    if (!codBarra) {
      return setErrorMsg(
        "El material no fue encontrado o no tiene código de barras.",
      );
    }

    if (!descripcionMaterial) {
      return setErrorMsg("No se pudo identificar la descripción del material.");
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return setErrorMsg("La cantidad debe ser mayor que 0.");
    }

    if (codBarra === codBarraProducto.trim().toUpperCase()) {
      return setErrorMsg(
        "El producto no puede agregarse como material de su propia fórmula.",
      );
    }

    setItems((previousItems) => {
      const existingIndex = previousItems.findIndex(
        (item) => item.cod_barra === codBarra,
      );

      if (existingIndex === -1) {
        return [
          ...previousItems,
          {
            cod_barra: codBarra,
            descripcion: descripcionMaterial,
            cantidad,
          },
        ];
      }

      const updatedItems = [...previousItems];

      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        cantidad: Number(updatedItems[existingIndex].cantidad) + cantidad,
      };

      return updatedItems;
    });

    limpiarMaterial();
  };

  /*
  |--------------------------------------------------------------------------
  | Editar cantidad
  |--------------------------------------------------------------------------
  */

  const editarCantidad = (index, value) => {
    const normalized = normalizarNumero(value);

    if (!/^\d*\.?\d*$/.test(normalized)) {
      return;
    }

    setItems((previousItems) => {
      const updatedItems = [...previousItems];

      updatedItems[index] = {
        ...updatedItems[index],
        cantidad: normalized,
      };

      return updatedItems;
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Quitar material
  |--------------------------------------------------------------------------
  */

  const quitarItem = (index) => {
    setItems((previousItems) =>
      previousItems.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Guardar cambios
  |--------------------------------------------------------------------------
  */

  const guardarCambios = async () => {
    setErrorMsg("");

    if (!formulaCargada || !codBarraProducto) {
      return setErrorMsg("Primero buscá una fórmula existente.");
    }

    if (!items.length) {
      return setErrorMsg("La fórmula debe tener al menos un material.");
    }

    const itemsNormalizados = items.map((item) => ({
      cod_barra: item.cod_barra,
      cantidad: Number(normalizarNumero(item.cantidad)),
    }));

    const tieneCantidadInvalida = itemsNormalizados.some(
      (item) => !Number.isFinite(item.cantidad) || item.cantidad <= 0,
    );

    if (tieneCantidadInvalida) {
      return setErrorMsg("Todas las cantidades deben ser mayores que 0.");
    }

    const tieneMaterialSinBarra = itemsNormalizados.some(
      (item) => !item.cod_barra,
    );

    if (tieneMaterialSinBarra) {
      return setErrorMsg("Hay materiales sin código de barras.");
    }

    try {
      setGuardando(true);

      const response = await api.put(
        `/produccion/formulas/${encodeURIComponent(codBarraProducto)}`,
        {
          items: itemsNormalizados,
        },
      );

      alert(response.data?.message || "Fórmula actualizada correctamente.");

      navigate("/produccion");
    } catch (error) {
      const detalle = error.response?.data?.detalle;

      let mensaje =
        error.response?.data?.error ||
        error.message ||
        "Error al actualizar la fórmula.";

      if (Array.isArray(detalle)) {
        mensaje += `: ${detalle.join(", ")}`;
      } else if (detalle && typeof detalle === "string") {
        mensaje += `: ${detalle}`;
      }

      setErrorMsg(mensaje);
    } finally {
      setGuardando(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Estado de botones
  |--------------------------------------------------------------------------
  */

  const puedeAgregarMaterial = useMemo(() => {
    const cantidad = Number(normalizarNumero(cantidadMaterial));

    return (
      formulaCargada &&
      Boolean(codBarraMaterial) &&
      Boolean(descripcionMaterial) &&
      Number.isFinite(cantidad) &&
      cantidad > 0 &&
      !buscandoMaterial
    );
  }, [
    formulaCargada,
    codBarraMaterial,
    descripcionMaterial,
    cantidadMaterial,
    buscandoMaterial,
  ]);

  const puedeGuardar = useMemo(() => {
    if (!formulaCargada || !codBarraProducto || !items.length || guardando) {
      return false;
    }

    return items.every((item) => {
      const cantidad = Number(normalizarNumero(item.cantidad));

      return (
        Boolean(item.cod_barra) && Number.isFinite(cantidad) && cantidad > 0
      );
    });
  }, [formulaCargada, codBarraProducto, items, guardando]);

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Editar fórmula</h2>

        <button
          type="button"
          className="nt-volver"
          onClick={() => navigate("/produccion")}
        >
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <h4>Buscar fórmula</h4>

        <div className="nt-row">
          <div className="nt-field">
            <label>Código de barras o descripción</label>

            <input
              type="text"
              placeholder="Escanee el código o escriba la descripción…"
              value={busquedaProducto}
              onChange={(event) => {
                setBusquedaProducto(event.target.value);

                limpiarFormula();
                setErrorMsg("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  buscarFormula();
                }
              }}
            />
          </div>

          <div className="nt-field">
            <label>Código de barras</label>

            <input
              type="text"
              value={codBarraProducto}
              readOnly
              placeholder="Se completa al buscar"
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>

            <input
              type="text"
              value={descripcionProducto}
              readOnly
              placeholder="Se completa al buscar"
            />
          </div>

          <div className="nt-actions">
            <button
              type="button"
              className="btn-light"
              onClick={buscarFormula}
              disabled={buscandoFormula}
            >
              {buscandoFormula ? "Buscando…" : "Buscar fórmula"}
            </button>
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>Agregar materiales</h4>

        <div className="nt-row">
          <div className="nt-field">
            <label>Código de barras o descripción</label>

            <input
              type="text"
              placeholder="Escanee o escriba la descripción…"
              value={busquedaMaterial}
              disabled={!formulaCargada}
              onChange={(event) => {
                setBusquedaMaterial(event.target.value);

                setCodBarraMaterial("");
                setDescripcionMaterial("");

                setErrorMsg("");
              }}
            />
          </div>

          <div className="nt-field">
            <label>Código de barras</label>

            <input
              type="text"
              value={codBarraMaterial}
              readOnly
              placeholder={
                buscandoMaterial ? "Buscando…" : "Se completa automáticamente"
              }
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>

            <input
              type="text"
              value={descripcionMaterial}
              readOnly
              placeholder={
                buscandoMaterial ? "Buscando…" : "Se completa automáticamente"
              }
            />
          </div>

          <div className="nt-field small">
            <label>Cantidad</label>

            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 0.25"
              value={cantidadMaterial}
              disabled={!formulaCargada}
              onChange={(event) =>
                permitirDecimalPositivo(event.target.value, setCantidadMaterial)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && puedeAgregarMaterial) {
                  event.preventDefault();
                  cargarYContinuar();
                }
              }}
            />
          </div>

          <div className="nt-actions">
            <button
              type="button"
              className="btn-light"
              onClick={cargarYContinuar}
              disabled={!puedeAgregarMaterial}
            >
              Cargar y continuar
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={guardarCambios}
              disabled={!puedeGuardar}
            >
              {guardando ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>Materiales de la fórmula</h4>

        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código de barras</th>

                <th>Descripción</th>

                <th
                  style={{
                    textAlign: "right",
                    width: 130,
                  }}
                >
                  Cantidad
                </th>

                <th
                  style={{
                    width: 100,
                  }}
                >
                  Acción
                </th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    {formulaCargada
                      ? "La fórmula no tiene materiales."
                      : "Buscá una fórmula para ver sus materiales."}
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.cod_barra}>
                    <td>{item.cod_barra}</td>

                    <td>{item.descripcion}</td>

                    <td
                      style={{
                        textAlign: "right",
                      }}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.cantidad}
                        onChange={(event) =>
                          editarCantidad(index, event.target.value)
                        }
                        style={{
                          width: 90,
                          textAlign: "right",
                        }}
                      />
                    </td>

                    <td>
                      <button
                        type="button"
                        className="borrar-btn"
                        onClick={() => quitarItem(index)}
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

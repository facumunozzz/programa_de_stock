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

export default function CrearFormula() {
  const navigate = useNavigate();

  /*
  |--------------------------------------------------------------------------
  | Producto
  |--------------------------------------------------------------------------
  */

  const [busquedaProducto, setBusquedaProducto] = useState("");

  const [codBarraProducto, setCodBarraProducto] = useState("");

  const [descripcionProducto, setDescripcionProducto] = useState("");

  const [productoVerificado, setProductoVerificado] = useState(false);

  const [verificandoProducto, setVerificandoProducto] = useState(false);

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

  const permitirDecimalPositivo = (value) => {
    const normalized = normalizarNumero(value);

    if (/^\d*\.?\d*$/.test(normalized)) {
      setCantidadMaterial(normalized);
    }
  };

  const limpiarProducto = () => {
    setCodBarraProducto("");
    setDescripcionProducto("");
    setProductoVerificado(false);
  };

  const limpiarMaterial = () => {
    setBusquedaMaterial("");
    setCodBarraMaterial("");
    setDescripcionMaterial("");
    setCantidadMaterial("");
  };

  /*
  |--------------------------------------------------------------------------
  | Buscar automáticamente el material
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
  | Verificar producto
  |--------------------------------------------------------------------------
  */

  const verificarProducto = async () => {
    setErrorMsg("");

    const referencia = busquedaProducto.trim();

    if (!referencia) {
      return setErrorMsg("Ingresá un código de barras o una descripción.");
    }

    try {
      setVerificandoProducto(true);

      const response = await api.get(
        `/articulos/referencia/${encodeURIComponent(referencia)}`,
      );

      const articulo = response.data || {};

      if (!articulo.cod_barra) {
        limpiarProducto();

        return setErrorMsg("El artículo encontrado no tiene código de barras.");
      }

      setCodBarraProducto(String(articulo.cod_barra));

      setDescripcionProducto(articulo.descripcion || "");

      setBusquedaProducto(articulo.descripcion || articulo.cod_barra);

      setProductoVerificado(true);
    } catch (error) {
      limpiarProducto();

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        "No se encontró el producto.";

      setErrorMsg(mensaje);
    } finally {
      setVerificandoProducto(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Agregar material
  |--------------------------------------------------------------------------
  */

  const agregarItem = () => {
    setErrorMsg("");

    const codBarra = codBarraMaterial.trim().toUpperCase();

    const cantidad = Number(normalizarNumero(cantidadMaterial));

    if (!busquedaMaterial.trim()) {
      return setErrorMsg(
        "Ingresá el código de barras o la descripción del material.",
      );
    }

    if (!codBarra) {
      return setErrorMsg(
        "El material ingresado no fue encontrado o no tiene código de barras.",
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
  | Crear fórmula
  |--------------------------------------------------------------------------
  */

  const confirmar = async () => {
    setErrorMsg("");

    if (!productoVerificado || !codBarraProducto) {
      return setErrorMsg("Primero verificá el producto.");
    }

    if (!items.length) {
      return setErrorMsg(
        'Agregá al menos un material con "Cargar y continuar".',
      );
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

    try {
      setGuardando(true);

      const response = await api.post("/produccion/formulas", {
        cod_barra: codBarraProducto,
        items: itemsNormalizados,
      });

      alert(response.data?.message || "Fórmula creada correctamente.");

      navigate("/produccion");
    } catch (error) {
      const detalle = error.response?.data?.detalle;

      let mensaje =
        error.response?.data?.error ||
        error.message ||
        "Error al crear la fórmula.";

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
      productoVerificado &&
      Boolean(codBarraMaterial) &&
      Boolean(descripcionMaterial) &&
      Number.isFinite(cantidad) &&
      cantidad > 0 &&
      !buscandoMaterial
    );
  }, [
    productoVerificado,
    codBarraMaterial,
    descripcionMaterial,
    cantidadMaterial,
    buscandoMaterial,
  ]);

  const puedeConfirmar = useMemo(
    () =>
      productoVerificado &&
      Boolean(codBarraProducto) &&
      items.length > 0 &&
      !guardando,
    [productoVerificado, codBarraProducto, items.length, guardando],
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Crear fórmula</h2>

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
        <h4>Producto</h4>

        <div className="nt-row">
          <div className="nt-field">
            <label>Código de barras o descripción</label>

            <input
              type="text"
              placeholder="Escanee el código o escriba la descripción…"
              value={busquedaProducto}
              onChange={(event) => {
                setBusquedaProducto(event.target.value);

                limpiarProducto();
                setItems([]);
                setErrorMsg("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  verificarProducto();
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
              placeholder="Se completa al verificar"
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>

            <input
              type="text"
              value={descripcionProducto}
              readOnly
              placeholder="Se completa al verificar"
            />
          </div>

          <div className="nt-actions">
            <button
              type="button"
              className="btn-light"
              onClick={verificarProducto}
              disabled={verificandoProducto}
            >
              {verificandoProducto ? "Verificando…" : "Verificar"}
            </button>
          </div>
        </div>
      </div>

      {productoVerificado && (
        <>
          <div className="nt-card">
            <h4>Materiales</h4>

            <div className="nt-row">
              <div className="nt-field">
                <label>Código de barras o descripción</label>

                <input
                  type="text"
                  placeholder="Escanee o escriba la descripción…"
                  value={busquedaMaterial}
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
                    buscandoMaterial
                      ? "Buscando…"
                      : "Se completa automáticamente"
                  }
                />
              </div>

              <div className="nt-field">
                <label>Descripción</label>

                <input type="text" value={descripcionMaterial} readOnlyplaceholder={
                    buscandoMaterial
                      ? "Buscando…"
                      : "Se completa automáticamente"}
                />
              </div>

              <div className="nt-field small">
                <label>Cantidad</label>

                <input type="text" inputMode="decimal" placeholder="Ej: 0.25" value={cantidadMaterial}
                  onChange={(event) =>
                    permitirDecimalPositivo(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && puedeAgregarMaterial) {
                      event.preventDefault();
                      agregarItem();
                    }
                  }}
                />
              </div>

              <div className="nt-actions">
                <button type="button" className="btn-light" onClick={agregarItem} disabled={!puedeAgregarMaterial}>
                  Cargar y continuar
                </button>

                <button type="button" className="btn-primary" onClick={confirmar} disabled={!puedeConfirmar}>
                  {guardando ? "Guardando…" : "Confirmar"}
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
                    <th>Código de barras</th>
                    <th>Descripción</th>
                    <th style={{textAlign: "right"}}>
                      Cantidad
                    </th>
                    <th>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        No hay materiales cargados. Usá “Cargar y continuar”.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.cod_barra}>
                        <td>{item.cod_barra}</td>
                        <td>{item.descripcion}</td>
                        <td style={{textAlign: "right"}}>
                          {item.cantidad}
                        </td>
                        <td>
                          <button type="button" className="borrar-btn" onClick={() => quitarItem(index)}>
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

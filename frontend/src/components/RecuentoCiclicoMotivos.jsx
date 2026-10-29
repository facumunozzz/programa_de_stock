import React, { useCallback, useEffect, useState } from "react";

import api from "../api/axiosConfig";

export default function RecuentoCiclicoMotivos({ onChanged }) {
  const [motivos, setMotivos] = useState([]);

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [orden, setOrden] = useState("");

  const [editando, setEditando] = useState(null);

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError("");

      const response = await api.get("/recuento-ciclico/motivos", {
        params: {
          todas: 1,
        },
      });

      setMotivos(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detalle ||
          err.response?.data?.error ||
          "No se pudieron cargar los motivos.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiar = () => {
    setCodigo("");
    setDescripcion("");
    setOrden("");
    setEditando(null);
    setError("");
  };

  const guardar = async () => {
    const codigoLimpio = String(codigo || "")
      .trim()
      .toUpperCase();

    const descripcionLimpia = String(descripcion || "").trim();

    if (!codigoLimpio) {
      setError("Ingresá el código.");
      return;
    }

    if (!descripcionLimpia) {
      setError("Ingresá la descripción del motivo.");
      return;
    }

    try {
      setError("");

      const payload = {
        codigo: codigoLimpio,
        descripcion: descripcionLimpia,
        orden: orden === "" ? null : Number(orden),
        activo: true,
      };

      if (editando) {
        await api.put(`/recuento-ciclico/motivos/${editando}`, payload);
      } else {
        await api.post("/recuento-ciclico/motivos", payload);
      }

      limpiar();

      await cargar();

      if (typeof onChanged === "function") {
        await onChanged();
      }
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detalle ||
          err.response?.data?.error ||
          "No se pudo guardar el motivo.",
      );
    }
  };

  const editar = (motivo) => {
    setEditando(motivo.id_motivo);

    setCodigo(String(motivo.codigo || ""));

    setDescripcion(String(motivo.descripcion || ""));

    setOrden(
      motivo.orden === null || motivo.orden === undefined
        ? ""
        : String(motivo.orden),
    );

    setError("");
  };

  const eliminar = async (motivo) => {
    const confirmar = window.confirm(
      `¿Eliminar el motivo ${motivo.codigo} - ${motivo.descripcion}?`,
    );

    if (!confirmar) {
      return;
    }

    try {
      await api.delete(`/recuento-ciclico/motivos/${motivo.id_motivo}`);

      if (Number(editando) === Number(motivo.id_motivo)) {
        limpiar();
      }

      await cargar();

      if (typeof onChanged === "function") {
        await onChanged();
      }
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detalle ||
          err.response?.data?.error ||
          "No se pudo eliminar el motivo.",
      );
    }
  };

  const reactivar = async (motivo) => {
    try {
      await api.put(`/recuento-ciclico/motivos/${motivo.id_motivo}`, {
        codigo: motivo.codigo,
        descripcion: motivo.descripcion,
        orden: motivo.orden,
        activo: true,
      });

      await cargar();

      if (typeof onChanged === "function") {
        await onChanged();
      }
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detalle ||
          err.response?.data?.error ||
          "No se pudo reactivar el motivo.",
      );
    }
  };

  return (
    <section className="rc-kaizen-section rc-motivos-admin">
      <div className="rc-motivos-header">
        <div>
          <h3>Administrar motivos de diferencia</h3>

          <div className="rc-kaizen-subtitle">
            Estos motivos estarán disponibles para clasificar las diferencias
            encontradas durante el recuento.
          </div>
        </div>
      </div>

      {error && <div className="rc-motivos-error">{error}</div>}

      <div className="rc-motivos-form">
        <label>
          Código
          <input
            type="text"
            value={codigo}
            maxLength={100}
            placeholder="Ej. A"
            onChange={(e) => setCodigo(e.target.value)}
          />
        </label>

        <label className="rc-motivos-descripcion">
          Descripción
          <input
            type="text"
            value={descripcion}
            maxLength={250}
            placeholder="Ej. Error de ingreso"
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>

        <label>
          Orden
          <input
            type="number"
            min="1"
            step="1"
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
          />
        </label>

        <div className="rc-motivos-actions">
          <button type="button" className="rc-btn" onClick={guardar}>
            {editando ? "Guardar cambios" : "Crear motivo"}
          </button>

          {editando && (
            <button
              type="button"
              className="rc-btn-secondary"
              onClick={limpiar}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="rc-kaizen-scroll">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Orden</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="5">Cargando...</td>
              </tr>
            ) : motivos.length === 0 ? (
              <tr>
                <td colSpan="5">No hay motivos configurados.</td>
              </tr>
            ) : (
              motivos.map((motivo) => (
                <tr key={motivo.id_motivo}>
                  <td>
                    <strong>{motivo.codigo}</strong>
                  </td>

                  <td>{motivo.descripcion}</td>

                  <td>{motivo.orden ?? ""}</td>

                  <td>{motivo.activo ? "Activo" : "Eliminado"}</td>

                  <td>
                    <div className="rc-motivos-row-actions">
                      {motivo.activo ? (
                        <>
                          <button
                            type="button"
                            className="rc-btn-secondary"
                            onClick={() => editar(motivo)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="rc-btn-danger"
                            onClick={() => eliminar(motivo)}
                          >
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="rc-btn-secondary"
                          onClick={() => reactivar(motivo)}
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

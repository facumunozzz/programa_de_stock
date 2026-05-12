import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";
import "./../styles/remitos.css";

export default function Ajustes() {
  const navigate = useNavigate();

  const [ajustes, setAjustes] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [importando, setImportando] = useState(false);

  const [modalMotivos, setModalMotivos] = useState(false);
  const [motivos, setMotivos] = useState([]);
  const [nuevoMotivo, setNuevoMotivo] = useState("");

  const [editMotivoId, setEditMotivoId] = useState(null);
  const [editMotivoNombre, setEditMotivoNombre] = useState("");
  const [editMotivoActivo, setEditMotivoActivo] = useState(true);

  const fetchAjustes = () => {
    api
      .get("/ajustes")
      .then((res) => setAjustes(res.data || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchAjustes();
  }, []);

  // =========================
  // Descargar plantilla Excel
  // =========================
  const descargarPlantilla = async () => {
    try {
      const res = await api.get("/ajustes/plantilla", {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(res.data);

      const a = document.createElement("a");
      a.href = url;
      a.download = "Plantilla_Ajustes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error al descargar la plantilla");
    }
  };

  // =========================
  // Importar Excel
  // =========================
  const importarExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImportando(true);

      await api.post("/ajustes/importar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      fetchAjustes();
      alert("Ajustes importados correctamente");
    } catch (err) {
      console.error(err);

      if (err.response?.data?.errores) {
        alert(
          "Errores en el archivo:\n" +
            err.response.data.errores
              .map((x) => `Fila ${x.fila}: ${x.error}`)
              .join("\n"),
        );
        return;
      }

      if (
        err.response?.data?.detalle &&
        Array.isArray(err.response.data.detalle)
      ) {
        alert(
          "No se encontraron estos códigos/cód barras:\n" +
            err.response.data.detalle.join("\n"),
        );
        return;
      }

      alert(err.response?.data?.error || "Error al importar ajustes");
    } finally {
      setImportando(false);
      e.target.value = "";
    }
  };

  // =========================
  // Motivos
  // =========================
  const fetchMotivos = async () => {
    try {
      const res = await api.get("/ajustes/motivos");
      setMotivos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al cargar motivos",
      );
      setMotivos([]);
    }
  };

  const abrirMotivos = async () => {
    await fetchMotivos();
    setNuevoMotivo("");
    setEditMotivoId(null);
    setEditMotivoNombre("");
    setEditMotivoActivo(true);
    setModalMotivos(true);
  };

  const crearMotivo = async () => {
    const nombre = nuevoMotivo.trim();

    if (!nombre) {
      alert("Ingresá un motivo");
      return;
    }

    try {
      await api.post("/ajustes/motivos", { nombre });
      setNuevoMotivo("");
      await fetchMotivos();
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al crear motivo",
      );
    }
  };

  const iniciarEditarMotivo = (m) => {
    setEditMotivoId(m.id_motivo);
    setEditMotivoNombre(m.nombre || "");
    setEditMotivoActivo(Boolean(m.activo));
  };

  const cancelarEditarMotivo = () => {
    setEditMotivoId(null);
    setEditMotivoNombre("");
    setEditMotivoActivo(true);
  };

  const guardarMotivo = async (id) => {
    const nombre = editMotivoNombre.trim();

    if (!nombre) {
      alert("El motivo no puede estar vacío");
      return;
    }

    try {
      await api.put(`/ajustes/motivos/${id}`, {
        nombre,
        activo: editMotivoActivo,
      });

      cancelarEditarMotivo();
      await fetchMotivos();
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al editar motivo",
      );
    }
  };

  const eliminarMotivo = async (m) => {
    const ok = window.confirm(`¿Eliminar el motivo "${m.nombre}"?`);
    if (!ok) return;

    try {
      await api.delete(`/ajustes/motivos/${m.id_motivo}`);
      await fetchMotivos();
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al eliminar motivo",
      );
    }
  };

  // =========================
  // Filtro
  // =========================
  const filtrados = ajustes.filter((a) =>
    Object.values(a).some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(filtro.toLowerCase()),
    ),
  );

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Altas y Bajas / Ajustes</h2>

      <div className="acciones">
        <button onClick={() => navigate("/ajustes/nuevo")}>
          Nuevos Altas o Bajas / Ajustes
        </button>

        <button onClick={abrirMotivos}>Motivos</button>

        <button onClick={descargarPlantilla}>📤 Descargar plantilla</button>

        <label style={{ cursor: "pointer" }}>
          📥 Importar Excel
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm"
            onChange={importarExcel}
            disabled={importando}
            style={{ display: "none" }}
          />
        </label>

        <input
          type="text"
          placeholder="Filtrar ajustes"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Depósito</th>
            <th>Motivo</th>
            <th>Nro Ajuste</th>
          </tr>
        </thead>

        <tbody>
          {filtrados.length === 0 ? (
            <tr>
              <td colSpan="4">Sin ajustes cargados.</td>
            </tr>
          ) : (
            filtrados.map((a) => {
              const id = a.numero_ajuste ?? a.id;

              return (
                <tr
                  key={id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/ajustes/${id}`)}
                  title="Ver detalle"
                >
                  <td>
                    {a.fecha ? new Date(a.fecha).toLocaleString("es-AR") : ""}
                  </td>
                  <td>{a.deposito}</td>
                  <td>{a.motivo}</td>
                  <td>{id}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {modalMotivos && (
        <div className="remitos-modal">
          <div className="remitos-modal-content">
            <h2>MOTIVOS DE AJUSTE</h2>

            <div className="proveedor-nuevo">
              <input
                type="text"
                placeholder="Nuevo motivo..."
                value={nuevoMotivo}
                onChange={(e) => setNuevoMotivo(e.target.value)}
              />

              <button onClick={crearMotivo}>Agregar</button>
            </div>

            <div className="proveedores-scroll">
              <table className="proveedores-table">
                <thead>
                  <tr>
                    <th>MOTIVO</th>
                    <th>ACTIVO</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>

                <tbody>
                  {motivos.length === 0 ? (
                    <tr>
                      <td colSpan="3">Sin motivos cargados.</td>
                    </tr>
                  ) : (
                    motivos.map((m) => (
                      <tr key={m.id_motivo}>
                        <td>
                          {editMotivoId === m.id_motivo ? (
                            <input
                              value={editMotivoNombre}
                              onChange={(e) =>
                                setEditMotivoNombre(e.target.value)
                              }
                              autoFocus
                            />
                          ) : (
                            m.nombre
                          )}
                        </td>

                        <td>
                          {editMotivoId === m.id_motivo ? (
                            <select
                              value={editMotivoActivo ? "1" : "0"}
                              onChange={(e) =>
                                setEditMotivoActivo(e.target.value === "1")
                              }
                            >
                              <option value="1">Sí</option>
                              <option value="0">No</option>
                            </select>
                          ) : m.activo ? (
                            "Sí"
                          ) : (
                            "No"
                          )}
                        </td>

                        <td>
                          {editMotivoId === m.id_motivo ? (
                            <>
                              <button
                                onClick={() => guardarMotivo(m.id_motivo)}
                              >
                                Guardar
                              </button>

                              <button onClick={cancelarEditarMotivo}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => iniciarEditarMotivo(m)}>
                                Editar
                              </button>

                              <button onClick={() => eliminarMotivo(m)}>
                                Eliminar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="remitos-modal-footer">
              <button onClick={() => setModalMotivos(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

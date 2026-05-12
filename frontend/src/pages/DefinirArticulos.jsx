// src/pages/DefinirArticulos.jsx (UNIFICADO)
import React, { useEffect, useState } from "react";
import api from "../api/axiosConfig";
import { toast } from "react-toastify";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function DefinirArticulos() {
  const { id } = useParams();            // si hay id => modo “por artículo”
  const { token } = useAuth();
  const navigate = useNavigate();
  const authHeader = { Authorization: `Bearer ${token}` };

  // --- estado común ---
  const [loading, setLoading] = useState(false);

  // --- estado para modo GLOBAL ---
  const [clasificaciones, setClasificaciones] = useState([]);
  const [newNombre, setNewNombre] = useState("");

  // --- estado para modo ARTÍCULO ---
  const [rows, setRows] = useState([]); // {id_clasificacion, nombre, es_obligatoria, valor}

  // ====== MODO GLOBAL ======
  const fetchClasificaciones = async () => {
    setLoading(true);
    try {
      const res = await api.get("/clasificaciones", { headers: authHeader });
      setClasificaciones(res.data);
    } catch {
      toast.error("Error al cargar clasificaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newNombre.trim()) {
      toast.error("Ingrese un nombre de clasificación");
      return;
    }
    try {
      await api.post("/clasificaciones", { nombre: newNombre }, { headers: authHeader });
      toast.success("Clasificación creada");
      setNewNombre("");
      fetchClasificaciones();
    } catch {
      toast.error("Error al crear clasificación");
    }
  };

  const toggleFlag = async (cid, field) => {
    try {
      await api.patch(`/clasificaciones/${cid}`, { field }, { headers: authHeader });
      fetchClasificaciones();
    } catch {
      toast.error("Error al actualizar");
    }
  };

  const handleDelete = async (cid) => {
    if (!window.confirm("¿Eliminar esta clasificación?")) return;
    try {
      await api.delete(`/clasificaciones/${cid}`, { headers: authHeader });
      toast.success("Clasificación eliminada");
      fetchClasificaciones();
    } catch {
      toast.error("Error al eliminar clasificación");
    }
  };

  // ====== MODO ARTÍCULO ======
  const fetchArticuloClasif = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/articulos/${id}/clasificaciones`, { headers: authHeader });
      setRows(res.data);
    } catch {
      toast.error("Error al cargar clasificaciones del artículo");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeValor = (cid, valor) => {
    setRows(prev => prev.map(r => r.id_clasificacion === cid ? { ...r, valor } : r));
  };

  const saveArticuloClasif = async () => {
    const faltan = rows.filter(r => r.es_obligatoria && !String(r.valor || "").trim());
    if (faltan.length) {
      toast.error(`Faltan completar: ${faltan.map(f => f.nombre).join(", ")}`);
      return;
    }
    setLoading(true);
    try {
      await api.post(
        `/articulos/${id}/clasificaciones`,
        { clasificaciones: rows.map(r => ({ id_clasificacion: r.id_clasificacion, valor: r.valor })) },
        { headers: authHeader }
      );
      toast.success("Clasificaciones guardadas");
      navigate(-1);
    } catch {
      toast.error("Error al guardar clasificaciones");
    } finally {
      setLoading(false);
    }
  };

  // ====== EFECTO INICIAL ======
  useEffect(() => {
    if (id) {
      // modo por ARTÍCULO
      fetchArticuloClasif();
    } else {
      // modo GLOBAL
      fetchClasificaciones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ====== RENDER ======
  if (id) {
    // ---------- VISTA POR ARTÍCULO ----------
    return (
      <div className="articulos-container">
        <h2 className="module-title">Clasificaciones del artículo #{id}</h2>

        <div className="nt-card" style={{ maxWidth: 600 }}>
          {loading ? <p>Cargando…</p> : (
            <form className="nt-form">
              {rows.map(r => (
                <div key={r.id_clasificacion} className="nt-field">
                  <label>
                    {r.nombre} {r.es_obligatoria ? <span style={{ color: "red" }}>*</span> : ""}
                  </label>
                  <input
                    type="text"
                    value={r.valor || ""}
                    onChange={e => handleChangeValor(r.id_clasificacion, e.target.value)}
                    placeholder={r.es_obligatoria ? "Obligatorio" : ""}
                    required={r.es_obligatoria}
                  />
                </div>
              ))}
              <div className="nt-actions" style={{ marginTop: 16 }}>
                <button className="btn-primario" type="button" onClick={saveArticuloClasif} disabled={loading}>
                  Guardar
                </button>
                <button className="btn-secundario" type="button" onClick={() => navigate(-1)} style={{ marginLeft: 10 }}>
                  Volver
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ---------- VISTA GLOBAL ----------
  return (
    <div className="articulos-container">
      <h2 className="module-title">Definir Clasificaciones de Artículos</h2>

      <div className="nt-card" style={{ maxWidth: 700 }}>
        <div className="nt-form" style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Nueva clasificación..."
            value={newNombre}
            onChange={(e) => setNewNombre(e.target.value)}
          />
          <button className="btn-primario" onClick={handleAdd}>
            Agregar
          </button>
        </div>

        {loading ? (
          <p>Cargando...</p>
        ) : (
          <table className="nt-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Obligatoria</th>
                <th>Activa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clasificaciones.map((c) => (
                <tr key={c.id_clasificacion}>
                  <td>{c.nombre}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={c.es_obligatoria}
                      onChange={() => toggleFlag(c.id_clasificacion, "es_obligatoria")}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={c.activa}
                      onChange={() => toggleFlag(c.id_clasificacion, "activa")}
                    />
                  </td>
                  <td>
                    <button className="btn-secundario" onClick={() => handleDelete(c.id_clasificacion)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

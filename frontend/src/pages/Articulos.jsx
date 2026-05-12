import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";
import "./../styles/articulos.css";

function Articulos() {
  const { token } = useAuth();
  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const [articulos, setArticulos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [formVisible, setFormVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // ✅ Clasificaciones activas (para obligatorias dinámicas)
  const [clasificaciones, setClasificaciones] = useState([]);

  const emptyArticulo = {
    cod_articulo: "",
    descripcion: "",
    cod_modelo: "",
    color: "",
    talle: "",
    cod_barra: "",
    tipo: "",
    familia: "",
    subfamilia: "",
    material: "",
    iibb_aplica: "",
    lista_precios_aplica: "",
  };

  const [newArticulo, setNewArticulo] = useState({ ...emptyArticulo });
  const [editArticulo, setEditArticulo] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  const columnasChecklist = ["id_articulo", ...Object.keys(emptyArticulo)];

  const [visibleColumns, setVisibleColumns] = useState([
    "id_articulo",
    "cod_articulo",
    "descripcion",
    "cod_modelo",
    "color",
    "talle",
    "cod_barra",
    "tipo",
    "familia",
    "subfamilia",
    "material",
    "iibb_aplica",
    "lista_precios_aplica",
  ]);

  const itemsPerPage = 25;

  useEffect(() => {
    if (!token) return;
    fetchData();
    fetchClasificacionesActivas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchData = () => {
    api
      .get("/articulos", { headers: authHeader })
      .then((res) => {
        setArticulos(res.data || []);
        setFiltered(res.data || []);
      })
      .catch((err) => console.error(err));
  };

  // ✅ AHORA CON AUTH HEADER (porque tu ruta tiene authRequired)
  const fetchClasificacionesActivas = async () => {
    try {
      const res = await api.get("/clasificaciones/activas", { headers: authHeader });
      setClasificaciones(res.data || []);
    } catch (err) {
      console.error("No se pudieron cargar clasificaciones activas:", err);
      setClasificaciones([]);
    }
  };

  // ✅ Lista dinámica de campos obligatorios según DB
  const obligatorias = useMemo(() => {
    return (clasificaciones || [])
      .filter((c) => c.es_obligatoria)
      .map((c) => String(c.nombre || "").trim())
      .filter(Boolean);
  }, [clasificaciones]);

  const esObligatoria = (campo) => obligatorias.includes(campo);

  const validarObligatorias = (articulo) => {
    const faltantes = obligatorias.filter(
      (campo) => !String(articulo?.[campo] ?? "").trim()
    );

    if (faltantes.length) {
      setErrorMsg(
        "Faltan completar campos obligatorios: " +
          faltantes.map((f) => f.replace(/_/g, " ")).join(", ")
      );
      return false;
    }
    return true;
  };

  const handleFilter = (e, key) => {
    const value = (e.target.value || "").toLowerCase();
    setFiltered(
      articulos.filter((a) => String(a[key] || "").toLowerCase().includes(value))
    );
    setCurrentPage(1);
  };

  const handleCreate = () => {
    setErrorMsg("");

    // ✅ Validación obligatorias (dinámica)
    if (!validarObligatorias(newArticulo)) return;

    const existe = articulos.some(
      (a) =>
        String(a.cod_articulo || "").toLowerCase() ===
        String(newArticulo.cod_articulo || "").toLowerCase()
    );
    if (existe) {
      setErrorMsg("El código ya existe.");
      return;
    }

    api
      .post("/articulos", newArticulo, { headers: authHeader })
      .then(() => {
        fetchData();
        setFormVisible(false);
        setNewArticulo({ ...emptyArticulo });
      })
      .catch((err) => {
        setErrorMsg(err.response?.data?.error || "Error al crear artículo");
      });
  };

  const handleDelete = (id) => {
    if (!window.confirm("¿Eliminar artículo?")) return;
    api
      .delete(`/articulos/${id}`, { headers: authHeader })
      .then(fetchData)
      .catch((err) => console.error(err));
  };

  // ✅ Editar desde la fila (Acción)
  const openEditFromRow = (articulo) => {
    setEditArticulo({ ...articulo });
    setEditMode(true);
    setFormVisible(false);
    setErrorMsg("");
  };

  const toggleColumn = (col) => {
    if (col === "id_articulo") return; // fijo
    setVisibleColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  // Render de input con marca de obligatorio
  const renderInput = (obj, setObj, key) => {
    const obligatorio = esObligatoria(key);
    const label = key.replace(/_/g, " ").toUpperCase() + (obligatorio ? " *" : "");

    return (
      <input
        key={key}
        type="text"
        placeholder={label}
        value={obj[key] || ""}
        onChange={(e) => setObj({ ...obj, [key]: e.target.value })}
        className={obligatorio ? "campo-obligatorio" : ""}
      />
    );
  };

  return (
    <div className="articulos-container">
      <h2 className="module-title">Artículos</h2>

      {/* SOLO botón crear */}
      <button
        className="nuevo-btn"
        onClick={() => {
          setFormVisible(!formVisible);
          setEditMode(false);
          setErrorMsg("");
        }}
      >
        {formVisible ? "Cancelar" : "Crear nuevo artículo"}
      </button>

      {/* ================= MODAL CREAR ================= */}
      {formVisible && (
        <div className="modal is-open" role="dialog" aria-modal="true">
          <div className="modal-contenido">
            <div className="modal-header">
              <h3 className="modal-title">Nuevo Artículo</h3>
              <button
                className="modal-close"
                onClick={() => setFormVisible(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {errorMsg && <p className="error">{errorMsg}</p>}
              {Object.keys(emptyArticulo).map((key) =>
                renderInput(newArticulo, setNewArticulo, key)
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secundario" onClick={() => setFormVisible(false)}>
                Cancelar
              </button>
              <button className="btn-primario" onClick={handleCreate}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL EDITAR ================= */}
      {editMode && (
        <div className="modal is-open" role="dialog" aria-modal="true">
          <div className="modal-contenido">
            <div className="modal-header">
              <h3 className="modal-title">Editar Artículo</h3>
              <button className="modal-close" onClick={() => setEditMode(false)} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="modal-body">
              {errorMsg && <p className="error">{errorMsg}</p>}

              {/* id_articulo solo lectura */}
              <input
                type="text"
                value={editArticulo.id_articulo ?? ""}
                disabled
                placeholder="ID_ARTICULO"
              />

              {Object.keys(emptyArticulo).map((key) =>
                renderInput(editArticulo, setEditArticulo, key)
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secundario" onClick={() => setEditMode(false)}>
                Cancelar
              </button>
              <button
                className="btn-primario"
                onClick={() => {
                  setErrorMsg("");
                  if (!validarObligatorias(editArticulo)) return;

                  api
                    .put(`/articulos/${editArticulo.id_articulo}`, editArticulo, { headers: authHeader })
                    .then(() => {
                      fetchData();
                      setEditMode(false);
                      setErrorMsg("");
                    })
                    .catch((err) =>
                      setErrorMsg(err.response?.data?.error || "Error al editar")
                    );
                }}
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= CHECKLIST COLUMNAS ================= */}
      <div className="checklist-panel">
        {columnasChecklist.map((col) => (
          <label key={col}>
            <input
              type="checkbox"
              checked={visibleColumns.includes(col)}
              onChange={() => toggleColumn(col)}
              disabled={col === "id_articulo"}
            />
            <span></span>
            <span className="text">{col.replace(/_/g, " ").toUpperCase()}</span>
          </label>
        ))}
      </div>

      {/* ================= TABLA ================= */}
      <div className="tabla-articulos-container">
        <table className="tabla-articulos">
          <thead>
            <tr>
              {visibleColumns.includes("id_articulo") && <th>ID</th>}

              {visibleColumns.includes("cod_articulo") && (
                <th>
                  Código
                  <br />
                  <input
                    type="text"
                    onChange={(e) => handleFilter(e, "cod_articulo")}
                    placeholder="Filtrar"
                  />
                </th>
              )}

              {visibleColumns.includes("descripcion") && (
                <th>
                  Descripción
                  <br />
                  <input
                    type="text"
                    onChange={(e) => handleFilter(e, "descripcion")}
                    placeholder="Filtrar"
                  />
                </th>
              )}

              {visibleColumns
                .filter((c) => !["id_articulo", "cod_articulo", "descripcion"].includes(c))
                .map((col) => (
                  <th key={col}>{col.replace(/_/g, " ").toUpperCase()}</th>
                ))}

              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((a) => (
              <tr key={a.id_articulo}>
                {visibleColumns.includes("id_articulo") && <td>{a.id_articulo}</td>}
                {visibleColumns.includes("cod_articulo") && <td>{a.cod_articulo}</td>}
                {visibleColumns.includes("descripcion") && <td>{a.descripcion}</td>}

                {visibleColumns
                  .filter((c) => !["id_articulo", "cod_articulo", "descripcion"].includes(c))
                  .map((col) => (
                    <td key={col}>{a[col]}</td>
                  ))}

                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn-secundario" onClick={() => openEditFromRow(a)}>
                    Editar
                  </button>
                  <button className="borrar-btn" onClick={() => handleDelete(a.id_articulo)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINADO ================= */}
      <div className="paginado">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            className={currentPage === i + 1 ? "activo" : ""}
            onClick={() => setCurrentPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Articulos;

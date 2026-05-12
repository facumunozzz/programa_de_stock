import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/remitos.css";

export default function Remitos() {
  const navigate = useNavigate();

  const [remitos, setRemitos] = useState([]);
  const [filtro, setFiltro] = useState("");

  const [modalProveedores, setModalProveedores] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [nuevoProveedor, setNuevoProveedor] = useState("");

  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState("");

  const [modalArticulos, setModalArticulos] = useState(false);
  const [articulosRemito, setArticulosRemito] = useState([]);
  const [filtroArticulos, setFiltroArticulos] = useState("");

  useEffect(() => {
    fetchRemitos();
  }, []);

  const normalizarArray = (data, propiedadPrincipal) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.[propiedadPrincipal])) return data[propiedadPrincipal];
    if (Array.isArray(data?.recordset)) return data.recordset;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  const fetchRemitos = async () => {
    try {
      const res = await api.get("/remitos");
      const rows = normalizarArray(res.data, "remitos");
      setRemitos(rows);
    } catch (err) {
      console.error(err);
      alert("Error al cargar remitos");
      setRemitos([]);
    }
  };

  const fetchProveedores = async () => {
    try {
      const res = await api.get("/remito-proveedores");
      const rows = normalizarArray(res.data, "proveedores");
      setProveedores(rows);
    } catch (err) {
      console.error(err);
      alert("Error al cargar proveedores");
      setProveedores([]);
    }
  };

  const abrirProveedores = async () => {
    await fetchProveedores();
    setNuevoProveedor("");
    setEditId(null);
    setEditNombre("");
    setModalProveedores(true);
  };

  const crearProveedor = async () => {
    const nombre = nuevoProveedor.trim();

    if (!nombre) {
      alert("Ingresá un nombre de proveedor");
      return;
    }

    try {
      await api.post("/remito-proveedores", { nombre });
      setNuevoProveedor("");
      await fetchProveedores();
    } catch (err) {
      alert(err.response?.data?.error || "Error al crear proveedor");
      console.error(err);
    }
  };

  const iniciarEditar = (p) => {
    setEditId(p.id_proveedor);
    setEditNombre(p.nombre || "");
  };

  const cancelarEditar = () => {
    setEditId(null);
    setEditNombre("");
  };

  const guardarProveedor = async (id) => {
    const nombre = editNombre.trim();

    if (!nombre) {
      alert("El nombre no puede estar vacío");
      return;
    }

    try {
      await api.put(`/remito-proveedores/${id}`, { nombre });
      cancelarEditar();
      await fetchProveedores();
    } catch (err) {
      alert(err.response?.data?.error || "Error al editar proveedor");
      console.error(err);
    }
  };

  const eliminarProveedor = async (p) => {
    const ok = window.confirm(`¿Eliminar el proveedor "${p.nombre}"?`);
    if (!ok) return;

    try {
      await api.delete(`/remito-proveedores/${p.id_proveedor}`);
      await fetchProveedores();
    } catch (err) {
      alert(err.response?.data?.error || "Error al eliminar proveedor");
      console.error(err);
    }
  };

  const fetchArticulosRemito = async () => {
    try {
      const res = await api.get("/remitos/articulos");
      const rows = normalizarArray(res.data, "articulos");
      setArticulosRemito(rows);
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al cargar artículos para remitos"
      );
      setArticulosRemito([]);
    }
  };

  const abrirArticulos = async () => {
    await fetchArticulosRemito();
    setFiltroArticulos("");
    setModalArticulos(true);
  };

  const toggleArticulo = async (articulo) => {
    try {
      await api.put(`/remitos/articulos/${articulo.id_articulo}/toggle`, {
        activo: !articulo.activo,
      });

      await fetchArticulosRemito();
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al activar/desactivar artículo"
      );
    }
  };

  const remitosSafe = Array.isArray(remitos) ? remitos : [];
  const proveedoresSafe = Array.isArray(proveedores) ? proveedores : [];
  const articulosRemitoSafe = Array.isArray(articulosRemito)
    ? articulosRemito
    : [];

  const filtrados = remitosSafe.filter((r) =>
    Object.values(r).some((v) =>
      String(v ?? "").toLowerCase().includes(filtro.toLowerCase())
    )
  );

  const articulosFiltrados = articulosRemitoSafe.filter((a) =>
    Object.values(a).some((v) =>
      String(v ?? "").toLowerCase().includes(filtroArticulos.toLowerCase())
    )
  );

  return (
    <div className="remitos-page">
      <h1 className="remitos-title">REMITOS</h1>

      <div className="remitos-actions">
        <button onClick={() => navigate("/remitos/nuevo")}>
          Crear Remito
        </button>

        <button onClick={abrirProveedores}>Proveedores</button>

        <button onClick={abrirArticulos}>Artículos</button>
      </div>

      <div className="remitos-filter">
        <input
          type="text"
          placeholder="Filtrar remitos..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      <div className="remitos-table-wrap">
        <table className="remitos-table">
          <thead>
            <tr>
              <th>FECHA</th>
              <th>TIPO</th>
              <th>NRO REMITO</th>
              <th>PROVEEDOR</th>
              <th>USUARIO</th>
            </tr>
          </thead>

          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan="5">Sin remitos cargados.</td>
              </tr>
            ) : (
              filtrados.map((r, idx) => (
                <tr key={r.id_remito ?? idx}>
                  <td>
                    {r.fecha
                      ? new Date(r.fecha).toLocaleDateString("es-AR")
                      : ""}
                  </td>
                  <td>{r.tipo || ""}</td>
                  <td>{r.nro_remito || ""}</td>
                  <td>{r.proveedor || ""}</td>
                  <td>{r.usuario || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalProveedores && (
        <div className="remitos-modal">
          <div className="remitos-modal-content">
            <h2>PROVEEDORES</h2>

            <div className="proveedor-nuevo">
              <input
                type="text"
                placeholder="Nuevo proveedor..."
                value={nuevoProveedor}
                onChange={(e) => setNuevoProveedor(e.target.value)}
              />

              <button onClick={crearProveedor}>Agregar</button>
            </div>

            <div className="proveedores-scroll">
              <table className="proveedores-table">
                <thead>
                  <tr>
                    <th>NOMBRE PROVEEDOR</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>

                <tbody>
                  {proveedoresSafe.length === 0 ? (
                    <tr>
                      <td colSpan="2">Sin proveedores cargados.</td>
                    </tr>
                  ) : (
                    proveedoresSafe.map((p, idx) => (
                      <tr key={p.id_proveedor ?? idx}>
                        <td>
                          {editId === p.id_proveedor ? (
                            <input
                              value={editNombre}
                              onChange={(e) => setEditNombre(e.target.value)}
                              autoFocus
                            />
                          ) : (
                            p.nombre
                          )}
                        </td>

                        <td>
                          {editId === p.id_proveedor ? (
                            <>
                              <button
                                onClick={() => guardarProveedor(p.id_proveedor)}
                              >
                                Guardar
                              </button>

                              <button onClick={cancelarEditar}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => iniciarEditar(p)}>
                                Editar
                              </button>

                              <button onClick={() => eliminarProveedor(p)}>
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
              <button onClick={() => setModalProveedores(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalArticulos && (
        <div className="remitos-modal">
          <div className="remitos-modal-content">
            <h2>ARTÍCULOS PARA REMITOS</h2>

            <div className="remitos-filter">
              <input
                type="text"
                placeholder="Filtrar artículos..."
                value={filtroArticulos}
                onChange={(e) => setFiltroArticulos(e.target.value)}
              />
            </div>

            <div className="proveedores-scroll">
              <table className="proveedores-table">
                <thead>
                  <tr>
                    <th>CÓDIGO</th>
                    <th>DESCRIPCIÓN</th>
                    <th>ESTADO</th>
                    <th>ACCIÓN</th>
                  </tr>
                </thead>

                <tbody>
                  {articulosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="4">
                        No hay artículos con fórmula de producción.
                      </td>
                    </tr>
                  ) : (
                    articulosFiltrados.map((a) => (
                      <tr key={a.id_articulo}>
                        <td>{a.cod_articulo}</td>
                        <td>{a.descripcion}</td>
                        <td>{a.activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <button onClick={() => toggleArticulo(a)}>
                            {a.activo ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="remitos-modal-footer">
              <button onClick={() => setModalArticulos(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
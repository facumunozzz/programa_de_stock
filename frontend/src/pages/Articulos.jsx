import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import './articulos.css';

function Articulos() {
  const [articulos, setArticulos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [formVisible, setFormVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editLocked, setEditLocked] = useState(true);
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [newArticulo, setNewArticulo] = useState({
    cod_articulo: '',
    descripcion: '',
    cod_modelo: '',
    color: '',
    talle: '',
    cod_barra: '',
    tipo: '',
    familia: '',
    subfamilia: '',
    material: '',
    iibb_aplica: '',
    lista_precios_aplica: ''
  });
  const [editArticulo, setEditArticulo] = useState({ ...newArticulo });
  const [errorMsg, setErrorMsg] = useState('');
  const [visibleColumns, setVisibleColumns] = useState([
    'id_articulo','cod_articulo','descripcion','cod_modelo','color','talle','cod_barra','tipo','familia','subfamilia','material','iibb_aplica','lista_precios_aplica'
  ]);
  const itemsPerPage = 25;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    api.get('/articulos')
      .then(res => {
        setArticulos(res.data);
        setFiltered(res.data);
      })
      .catch(err => console.error(err));
  };

  const handleFilter = (e, key) => {
    const value = e.target.value.toLowerCase();
    setFiltered(
      articulos.filter(a =>
        String(a[key] || '').toLowerCase().includes(value)
      )
    );
    setCurrentPage(1);
  };

  const handleCreate = () => {
    setErrorMsg('');

    const existe = articulos.some(a => a.cod_articulo.toLowerCase() === newArticulo.cod_articulo.toLowerCase());
    if (existe) {
      setErrorMsg('El código ya existe. No se puede crear el artículo.');
      return;
    }

    api.post('/articulos', newArticulo)
      .then(() => {
        fetchData();
        setNewArticulo({
          cod_articulo: '',
          descripcion: '',
          cod_modelo: '',
          color: '',
          talle: '',
          cod_barra: '',
          tipo: '',
          familia: '',
          subfamilia: '',
          material: '',
          iibb_aplica: '',
          lista_precios_aplica: ''
        });
        setFormVisible(false);
      })
      .catch(err => {
        setErrorMsg(err.response?.data?.error || 'Error al crear el artículo');
      });
  };

  const handleDelete = (id) => {
    if (window.confirm("¿Estás seguro que deseas borrar este artículo?")) {
      api.delete(`/articulos/${id}`)
        .then(() => fetchData())
        .catch(err => console.error(err));
    }
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  const toggleColumn = (col) => {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  return (
    <div className="articulos-container">
      <h2>Artículos</h2>

      <button className="nuevo-btn" onClick={() => { setFormVisible(!formVisible); setEditMode(false); }}>
        {formVisible ? 'Cancelar' : 'Crear nuevo artículo'}
      </button>

      <button className="nuevo-btn" onClick={() => { setEditMode(!editMode); setFormVisible(false); }}>
        {editMode ? 'Cancelar' : 'Editar artículo'}
      </button>

      {formVisible && (
        <div className="modal-form">
          <h3>Nuevo Artículo</h3>
          {errorMsg && <p className="error">{errorMsg}</p>}
          {Object.keys(newArticulo).map(key => (
            <input
              key={key}
              type="text"
              placeholder={key.replace(/_/g, ' ').toUpperCase()}
              value={newArticulo[key]}
              onChange={e => setNewArticulo({ ...newArticulo, [key]: e.target.value })}
            />
          ))}
          <button onClick={handleCreate}>Guardar</button>
          <button className="cancelar-btn" onClick={() => setFormVisible(false)}>Cancelar</button>
        </div>
      )}

      {editMode && (
        <div className="modal-form">
          <h3>Editar Artículo</h3>
          <div>
            <input 
              type="text" 
              placeholder="CÓDIGO A BUSCAR" 
              value={codigoBusqueda} 
              onChange={e => setCodigoBusqueda(e.target.value)}
            />
            <button onClick={() => {
              api.get(`/articulos/codigo/${codigoBusqueda}`)
                .then(res => {
                  setEditArticulo(res.data);
                  setEditLocked(false);
                  setErrorMsg('');
                })
                .catch(() => {
                  setErrorMsg('Artículo no encontrado');
                  setEditLocked(true);
                });
            }}>
              Buscar
            </button>
          </div>
          {errorMsg && <p className="error">{errorMsg}</p>}
          {Object.keys(editArticulo).map(key => (
            <input
              key={key}
              type="text"
              placeholder={key.replace(/_/g, ' ').toUpperCase()}
              value={editArticulo[key] || ''}
              onChange={e => setEditArticulo({ ...editArticulo, [key]: e.target.value })}
              disabled={editLocked || key === 'id_articulo'}
            />
          ))}
          <button 
            onClick={() => {
              api.put(`/articulos/${editArticulo.id_articulo}`, editArticulo)
                .then(() => {
                  fetchData();
                  setEditMode(false);
                  setEditLocked(true);
                })
                .catch(err => setErrorMsg(err.response?.data?.error || 'Error al editar artículo'));
            }}
            disabled={editLocked}
          >
            Guardar cambios
          </button>
          <button className="cancelar-btn" onClick={() => setEditMode(false)}>Cancelar</button>
        </div>
      )}

      {/* Checklist de columnas */}
      <div className="checklist-panel">
        {Object.keys(newArticulo).map(col => (
          <label key={col}>
            <input
              type="checkbox"
              checked={visibleColumns.includes(col) || col === 'id_articulo'}
              onChange={() => toggleColumn(col)}
              disabled={col === 'id_articulo'}
            />
            {col.replace(/_/g, ' ').toUpperCase()}
          </label>
        ))}
      </div>

      <table className="tabla-articulos">
        <thead>
          <tr>
            {visibleColumns.includes('id_articulo') && <th>ID</th>}
            {visibleColumns.includes('cod_articulo') && (
              <th>
                Código<br />
                <input type="text" onChange={e => handleFilter(e, 'cod_articulo')} placeholder="Filtrar" />
              </th>
            )}
            {visibleColumns.includes('descripcion') && (
              <th>
                Descripción<br />
                <input type="text" onChange={e => handleFilter(e, 'descripcion')} placeholder="Filtrar" />
              </th>
            )}
            {visibleColumns.filter(c => !['id_articulo','cod_articulo','descripcion'].includes(c)).map(col => (
              <th key={col}>{col.replace(/_/g, ' ').toUpperCase()}</th>
            ))}
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map(a => (
            <tr key={a.id_articulo}>
              {visibleColumns.includes('id_articulo') && <td>{a.id_articulo}</td>}
              {visibleColumns.includes('cod_articulo') && <td>{a.cod_articulo}</td>}
              {visibleColumns.includes('descripcion') && <td>{a.descripcion}</td>}
              {visibleColumns.filter(c => !['id_articulo','cod_articulo','descripcion'].includes(c)).map(col => (
                <td key={col}>{a[col]}</td>
              ))}
              <td><button className="borrar-btn" onClick={() => handleDelete(a.id_articulo)}>Borrar</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="paginado">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            className={currentPage === i + 1 ? 'activo' : ''}
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

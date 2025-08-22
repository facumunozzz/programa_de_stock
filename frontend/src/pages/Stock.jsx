import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import * as XLSX from 'xlsx';
import './../styles/stock.css';

function Stock() {
  const [stock, setStock] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoDeposito, setNuevoDeposito] = useState('');
  const itemsPerPage = 25;

  useEffect(() => {
    fetchStock();
  }, []);

  const fetchStock = () => {
    api.get('/stock')
      .then(res => {
        setStock(res.data);
        setFiltered(res.data);
      })
      .catch(err => console.error(err));
  };

  const handleFilter = (e, key) => {
    const value = e.target.value.toLowerCase();
    setFiltered(
      stock.filter(item =>
        String(item[key]).toLowerCase().includes(value)
      )
    );
    setCurrentPage(1);
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  const handleCrearDeposito = async () => {
    if (!nuevoDeposito.trim()) {
      alert("El nombre del depósito no puede estar vacío.");
      return;
    }

    try {
      const res = await api.get('/depositos');
      const existe = res.data.some(dep =>
        dep.nombre.trim().toLowerCase() === nuevoDeposito.trim().toLowerCase()
      );

      if (existe) {
        alert("Ya existe un depósito con ese nombre.");
        return;
      }

      await api.post('/depositos', { nombre: nuevoDeposito.trim() });
      alert("Depósito creado correctamente.");
      setNuevoDeposito('');
      setMostrarModal(false);
    } catch (err) {
      alert("Error al crear el depósito.");
      console.error(err);
    }
  };

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    XLSX.writeFile(wb, 'stock.xlsx');
  };

  return (
    <div className="stock-container">
      <h2 className="module-title">Stock en Depósitos</h2>

      <div className="acciones">
        <button onClick={() => setMostrarModal(true)}>Crear depósito</button>
        <button onClick={exportarExcel}>Exportar a Excel</button>
      </div>

      {mostrarModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Nuevo Depósito</h3>
            <input
              type="text"
              placeholder="Nombre del depósito"
              value={nuevoDeposito}
              onChange={e => setNuevoDeposito(e.target.value)}
            />
            <div className="modal-botones">
              <button onClick={handleCrearDeposito}>Crear</button>
              <button onClick={() => setMostrarModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}


      <div className="tabla-stock-container">
        <table className="tabla-stock">
        <thead>
          <tr>
            <th>
              Código<br />
              <input type="text" onChange={e => handleFilter(e, 'cod_articulo')} placeholder="Filtrar" />
            </th>
            <th>
              Descripción<br />
              <input type="text" onChange={e => handleFilter(e, 'descripcion')} placeholder="Filtrar" />
            </th>

            {/* NUEVOS CAMPOS IGUAL QUE EN ARTÍCULOS */}
            <th>
              Cod. Modelo<br />
              <input type="text" onChange={e => handleFilter(e, 'cod_modelo')} placeholder="Filtrar" />
            </th>
            <th>
              Color<br />
              <input type="text" onChange={e => handleFilter(e, 'color')} placeholder="Filtrar" />
            </th>
            <th>
              Talle<br />
              <input type="text" onChange={e => handleFilter(e, 'talle')} placeholder="Filtrar" />
            </th>
            <th>
              Cod. Barra<br />
              <input type="text" onChange={e => handleFilter(e, 'cod_barra')} placeholder="Filtrar" />
            </th>
            <th>
              Tipo<br />
              <input type="text" onChange={e => handleFilter(e, 'tipo')} placeholder="Filtrar" />
            </th>
            <th>
              Familia<br />
              <input type="text" onChange={e => handleFilter(e, 'familia')} placeholder="Filtrar" />
            </th>
            <th>
              Subfamilia<br />
              <input type="text" onChange={e => handleFilter(e, 'subfamilia')} placeholder="Filtrar" />
            </th>
            <th>
              Material<br />
              <input type="text" onChange={e => handleFilter(e, 'material')} placeholder="Filtrar" />
            </th>
            <th>
              IIBB Aplica<br />
              <input type="text" onChange={e => handleFilter(e, 'iibb_aplica')} placeholder="Filtrar" />
            </th>
            <th>
              Lista Precios Aplica<br />
              <input type="text" onChange={e => handleFilter(e, 'lista_precios_aplica')} placeholder="Filtrar" />
            </th>

            {/* CAMPOS PROPIOS DE STOCK */}
            <th>
              Cantidad<br />
              <input type="text" onChange={e => handleFilter(e, 'cantidad')} placeholder="Filtrar" />
            </th>
            <th>
              Depósito<br />
              <input type="text" onChange={e => handleFilter(e, 'deposito')} placeholder="Filtrar" />
            </th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((item, idx) => (
            <tr key={idx}>
              <td>{item.cod_articulo ?? ''}</td>
              <td>{item.descripcion ?? ''}</td>

              {/* NUEVOS CAMPOS */}
              <td>{item.cod_modelo ?? ''}</td>
              <td>{item.color ?? ''}</td>
              <td>{item.talle ?? ''}</td>
              <td>{item.cod_barra ?? ''}</td>
              <td>{item.tipo ?? ''}</td>
              <td>{item.familia ?? ''}</td>
              <td>{item.subfamilia ?? ''}</td>
              <td>{item.material ?? ''}</td>
              <td>{item.iibb_aplica ?? ''}</td>
              <td>{item.lista_precios_aplica ?? ''}</td>

              {/* CAMPOS PROPIOS DE STOCK */}
              <td>{item.cantidad ?? 0}</td>
              <td>{item.deposito ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>


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

export default Stock;

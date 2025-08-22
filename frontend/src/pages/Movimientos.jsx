import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import './../styles/transferencias.css'; // reutilizo estilos de tablas

function Movimientos() {
  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const [filtros, setFiltros] = useState({
    fecha: '',
    codigo: '',
    descripcion: '',
    cantidad: '',
    deposito: '',
    usuario: '',
    movimiento: '',
    num_movimiento: '',
  });

  useEffect(() => {
    api.get('/movimientos')
      .then(res => {
        setRows(res.data || []);
        setFiltered(res.data || []);
      })
      .catch(err => console.error(err));
  }, []);

  const onFilterChange = (key, val) => {
    const value = (val ?? '').toLowerCase();
    const nf = { ...filtros, [key]: value };
    setFiltros(nf);

    const f = (rows || []).filter(r => {
      const v = {
        fecha: r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : '',
        codigo: r.codigo ?? '',
        descripcion: r.descripcion ?? '',
        cantidad: String(r.cantidad ?? ''),
        deposito: r.deposito ?? '',
        usuario: r.usuario ?? '',
        movimiento: r.movimiento ?? '',
        num_movimiento: r.num_movimiento ?? '',
      };
      return Object.keys(nf).every(k =>
        String(v[k]).toLowerCase().includes(nf[k])
      );
    });

    setFiltered(f);
    setCurrentPage(1);
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil((filtered.length || 0) / itemsPerPage);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Movimientos</h2>

      <div className="tabla-articulos-container">
        <table className="tabla-movimientos">
          <thead>
            <tr>
              <th>
                Fecha<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('fecha', e.target.value)}
                />
              </th>
              <th>
                Código<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('codigo', e.target.value)}
                />
              </th>
              <th>
                Descripción<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('descripcion', e.target.value)}
                />
              </th>
              <th style={{ textAlign: 'right' }}>
                Cantidad<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('cantidad', e.target.value)}
                />
              </th>
              <th>
                Depósito<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('deposito', e.target.value)}
                />
              </th>
              <th>
                Usuario<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('usuario', e.target.value)}
                />
              </th>
              <th>
                Movimiento<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('movimiento', e.target.value)}
                />
              </th>
              <th>
                Num. Movimiento<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('num_movimiento', e.target.value)}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={8}>Sin movimientos.</td></tr>
            ) : paginated.map((r, i) => (
              <tr key={i}>
                <td>{r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : ''}</td>
                <td>{r.codigo}</td>
                <td>{r.descripcion}</td>
                <td style={{ textAlign: 'right' }}>{r.cantidad}</td>
                <td>{r.deposito}</td>
                <td>{r.usuario ?? ''}</td>
                <td>{r.movimiento}</td>
                <td>{r.num_movimiento}</td>
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

export default Movimientos;


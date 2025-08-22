// frontend/src/pages/Transferencias.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import './../styles/transferencias.css';

function Transferencias() {
  const navigate = useNavigate();
  const [transferencias, setTransferencias] = useState([]);
  const [filtro, setFiltro] = useState('');

  const fetchTransferencias = () => {
    api.get('/transferencias')
      .then(res => setTransferencias(res.data || []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchTransferencias();
  }, []);

  const transferenciasFiltradas = transferencias.filter(t =>
    Object.values(t).some(val => String(val ?? '').toLowerCase().includes(filtro.toLowerCase()))
  );

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Transferencias</h2>

      <div className="acciones">
        <button onClick={() => navigate('/transferencias/nueva')}>
          Nueva transferencia
        </button>
        <input
          type="text"
          placeholder="Filtrar transferencias"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Nro Transferencia</th>
          </tr>
        </thead>
        <tbody>
          {transferenciasFiltradas.map(t => {
            const id = t.numero_transferencia ?? t.id;
            return (
              <tr
                key={id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/transferencias/${id}`)}
                title="Ver detalle"
              >
                <td>{t.fecha ? new Date(t.fecha).toLocaleString('es-AR') : ''}</td>
                <td>{t.origen}</td>
                <td>{t.destino}</td>
                <td>{id}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Transferencias;

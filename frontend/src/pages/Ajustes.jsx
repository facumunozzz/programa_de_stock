import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import './../styles/transferencias.css';

export default function Ajustes() {
  const navigate = useNavigate();
  const [ajustes, setAjustes] = useState([]);
  const [filtro, setFiltro] = useState('');

  const fetchAjustes = () => {
    api.get('/ajustes')
      .then(res => setAjustes(res.data || []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchAjustes();
  }, []);

  const filtrados = ajustes.filter(a =>
    Object.values(a).some(v => String(v ?? '').toLowerCase().includes(filtro.toLowerCase()))
  );

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Ajustes</h2>

      <div className="acciones">
        <button onClick={() => navigate('/ajustes/nuevo')}>
          Nuevo ajuste
        </button>
        <input
          type="text"
          placeholder="Filtrar ajustes"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
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
          {filtrados.map(a => (
            <tr key={a.numero_ajuste ?? a.id}>
              <td>{a.fecha ? new Date(a.fecha).toLocaleString('es-AR') : ''}</td>
              <td>{a.deposito}</td>
              <td>{a.motivo}</td>
              <td>{a.numero_ajuste ?? a.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


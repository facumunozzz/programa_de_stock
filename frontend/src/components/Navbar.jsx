import React from 'react';
import { NavLink } from 'react-router-dom';
import './../App.jsx';

function Navbar() {
  return (
    <nav className="navbar">
      <h2>ERP</h2>
      <ul>
        <li><NavLink to="/articulos">Artículos</NavLink></li>
        <li><NavLink to="/stock">Stock</NavLink></li>
        <li><NavLink to="/transferencias">Transferencias</NavLink></li>
        <li><NavLink to="/kardex">Kardex</NavLink></li>
        <li><NavLink to="/produccion">Producción</NavLink></li>
        <li><NavLink to="/ajustes">Ajustes</NavLink></li>
        <li><NavLink to="/movimientos">Movimientos</NavLink></li>
      </ul>
    </nav>
  );
}

export default Navbar;

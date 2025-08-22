import React from 'react';
import { NavLink } from 'react-router-dom';
import logoSZ from './../images/LOGO-SZCONSULTORES.png';
import logoAquatic from './../images/logo-aquatic.png';
import './../styles/navbar.css';

function Navbar() {
  return (
    <nav className="navbar">
      <img src={logoSZ} alt="SZ Consultores" className="logo-sz" />

      <ul className="navbar-menu">
        <li><NavLink to="/articulos">Artículos</NavLink></li>
        <li><NavLink to="/produccion">Formulas de Producción</NavLink></li>
        <li><NavLink to="/stock">Stock</NavLink></li>
        <li><NavLink to="/transferencias">Transferencias</NavLink></li>
        <li><NavLink to="/ajustes">Ajustes</NavLink></li>
        <li><NavLink to="/movimientos">Movimientos</NavLink></li>
      </ul>

      <img src={logoAquatic} alt="Aquatic" className="logo-aquatic" />
    </nav>
  );
}

export default Navbar;

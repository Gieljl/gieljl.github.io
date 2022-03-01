import React from 'react';
import logo from './yasa7.png';
import { Counter } from './features/counter/Counter';
import { DataGridDemo } from './features/stats/Stats'
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <DataGridDemo />
      </header>
    </div>
  );
}

export default App;

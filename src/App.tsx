import React from 'react';
import logo from './logo.svg';
import yasatlogo from './yasa7.png';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={yasatlogo} className="App-logo" alt="logo" />
        <p>
          Coming soon
        </p>
        
        <a
          className="App-link"
          href="http://roderikvandelogt.nl/yasat/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Yassat v1
        </a>
      </header>
    </div>
  );
}

export default App;

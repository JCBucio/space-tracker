import React, { useState } from "react";
import GlobeTracker from "./components/GlobeTracker";
import Sidebar from "./components/Sidebar";
import './index.css';

function App() {
  const [stations, setStations] = useState([]);
  const [selectedStationName, setSelectedStationName] = useState('');

  return (
    <div className="app-container">
      <Sidebar
        stations={stations}
        selectedStationName={selectedStationName}
        onStationSelect={setSelectedStationName}
      />
      <GlobeTracker
        selectedStationName={selectedStationName}
        onStationsUpdate={setStations}
        onStationSelect={setSelectedStationName}
      />
    </div>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import PhoneTelemetryCard from './Components/PhoneTelemetryCard';
import PhoneTelemetryPage from './Pages/PhoneTelemetryPage';
import './App.css';
import './index.css';
const API_URL = "https://api-fargvgjnga-uc.a.run.app/events";

export default function App() {
  const [activeView, setActiveView] = useState('bento'); // 'bento' | 'telemetry'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Single centralized fetch function
  const fetchTelemetry = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setEvents(json.data);
      }
    } catch (err) {
      console.error("Telemetry fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Runs once when the app opens
  useEffect(() => {
    fetchTelemetry();
  }, []);

  // Full Telemetry Page View
  if (activeView === 'telemetry') {
    return (
      <PhoneTelemetryPage
        events={events}
        loading={loading}
        onSync={fetchTelemetry}
        onBack={() => setActiveView('bento')}
      />
    );
  }

  // Bento Home View
  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="app-header">
        <div className="header-brand">
          <span className="status-dot"></span>
          <span>PERSONAL OS</span>
        </div>
        <button onClick={fetchTelemetry} disabled={loading} className="btn-pill mono">
          {loading ? "Syncing..." : "Sync"}
        </button>
      </header>

      {/* Main Bento Grid */}
      <div className="bento-grid">
        <PhoneTelemetryCard
          events={events}
          loading={loading}
          onOpen={() => setActiveView('telemetry')}
        />

        <div className="bento-card col-4 empty-slot">
          <div className="card-header">
            <span className="card-title mono">Slot 02</span>
          </div>
          <div className="empty-content mono">
            <div className="empty-title">Music & Audio</div>
            <div className="empty-desc">Pending module integration</div>
          </div>
        </div>

        <div className="bento-card col-4 empty-slot">
          <div className="card-header">
            <span className="card-title mono">Slot 03</span>
          </div>
          <div className="empty-content mono">
            <div className="empty-title">Daily Focus & Git</div>
            <div className="empty-desc">Pending module integration</div>
          </div>
        </div>

        <div className="bento-card col-4 empty-slot">
          <div className="card-header">
            <span className="card-title mono">Slot 04</span>
          </div>
          <div className="empty-content mono">
            <div className="empty-title">Health / Steps</div>
            <div className="empty-desc">Pending module integration</div>
          </div>
        </div>

        <div className="bento-card col-4 empty-slot">
          <div className="card-header">
            <span className="card-title mono">Slot 05</span>
          </div>
          <div className="empty-content mono">
            <div className="empty-title">Quick Notes / Scratchpad</div>
            <div className="empty-desc">Pending module integration</div>
          </div>
        </div>
      </div>
    </div>
  );
}
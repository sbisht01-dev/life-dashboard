import  { useState, useEffect } from 'react';
import PhoneTelemetryCard from './Components/PhoneTelemetryCard';
import PhoneTelemetryPage from './Pages/PhoneTelemetryPage';
import SleepCard from './Components/SleepCard';
import SleepPage from './Pages/SleepPage';
import './App.css';
import './index.css';
const API_URL = "https://api-fargvgjnga-uc.a.run.app/events";

export default function App() {
  const [activeView, setActiveView] = useState('bento');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchTelemetry();
  }, []);

  // -------------------------------------------------------------
  // FULL PAGE VIEWS
  // -------------------------------------------------------------
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

  if (activeView === 'sleep') {
    return (
      <SleepPage
        events={events}
        loading={loading}
        onSync={fetchTelemetry}
        onBack={() => setActiveView('bento')}
      />
    );
  }

  // -------------------------------------------------------------
  // BENTO GRID HOME VIEW
  // -------------------------------------------------------------
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
        {/* Bento Slot 01: Phone Telemetry (Width 8) */}
        <PhoneTelemetryCard
          events={events}
          loading={loading}
          onOpen={() => setActiveView('telemetry')}
        />

        {/* Bento Slot 02: Sleep Telemetry (Width 4) */}
        <SleepCard
          events={events}
          loading={loading}
          onOpen={() => setActiveView('sleep')}
        />

        {/* Bento Slot 03: Empty Placeholder (Width 4) */}
        <div className="bento-card col-4 empty-slot">
          <div className="card-header">
            <span className="card-title mono">Slot 03</span>
          </div>
          <div className="empty-content mono">
            <div className="empty-title">Music & Audio</div>
            <div className="empty-desc">Pending module integration</div>
          </div>
        </div>

        {/* Bento Slot 04: Empty Placeholder (Width 4) */}
        <div className="bento-card col-4 empty-slot">
          <div className="card-header">
            <span className="card-title mono">Slot 04</span>
          </div>
          <div className="empty-content mono">
            <div className="empty-title">Daily Focus & Git</div>
            <div className="empty-desc">Pending module integration</div>
          </div>
        </div>

        {/* Bento Slot 05: Empty Placeholder (Width 4) */}
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
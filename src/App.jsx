import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './utils/firebase';
import HabitsCard from './Components/HabitsCard';
import PhoneTelemetryCard from './Components/PhoneTelemetryCard';
import SleepCard from './Components/SleepCard';

import LoginPage from './Pages/LoginPage';
import PhoneTelemetryPage from './Pages/PhoneTelemetryPage';
import SleepPage from './Pages/SleepPage';
import HabitsPage from './Pages/HabitsPage';
import './App.css';
import './index.css';

const API_URL = "https://api-fargvgjnga-uc.a.run.app/events";

// Helper to get today's date in local time (YYYY-MM-DD)
const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  // --- AUTHENTICATION STATE ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- DASHBOARD STATE ---
  const [activeView, setActiveView] = useState('bento');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // State to control the global dashboard date
  const [dashboardDate, setDashboardDate] = useState(getLocalDateString());
  const todayStr = getLocalDateString();
  const isToday = dashboardDate === todayStr;

  // Listen for Firebase Login Status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Calendar Math: Shift date by X days
  const shiftDate = (daysOffset) => {
    const [y, m, d] = dashboardDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + daysOffset);
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    setDashboardDate(`${year}-${month}-${day}`);
  };

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

  // Only fetch telemetry once the user is confirmed logged in
  useEffect(() => {
    if (user) {
      fetchTelemetry();
    }
  }, [user]);

  // -------------------------------------------------------------
  // AUTHENTICATION GATEKEEPER
  // -------------------------------------------------------------
  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#090d16', color: '#8b5cf6', fontFamily: 'monospace' }}>
        Booting Personal OS...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

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

  if (activeView === 'habits') {
    return (
      <HabitsPage
        onBack={() => setActiveView('bento')}
      />
    );
  }

  // -------------------------------------------------------------
  // BENTO GRID HOME VIEW
  // -------------------------------------------------------------
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <span className="status-dot"></span>
          <span>PERSONAL OS</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* Date Selector with Jump Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={() => shiftDate(-1)} className="btn-pill" style={{ padding: "4px 8px", minWidth: "auto" }}>◀</button>
            <input 
              type="date" 
              value={dashboardDate} 
              onChange={(e) => setDashboardDate(e.target.value)} 
              className="clean-input mono"
            />
            <button 
              onClick={() => shiftDate(1)} 
              disabled={isToday} 
              className="btn-pill" 
              style={{ 
                padding: "4px 8px", 
                minWidth: "auto", 
                opacity: isToday ? 0.3 : 1, 
                cursor: isToday ? "not-allowed" : "pointer" 
              }}
            >
              ▶
            </button>
          </div>

          <button onClick={fetchTelemetry} disabled={loading} className="btn-pill mono">
            {loading ? "Syncing..." : "Sync"}
          </button>
          
          {/* Optional: Add a quick logout button here for testing */}
          <button onClick={() => auth.signOut()} className="btn-pill mono" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            Lock OS
          </button>
        </div>
      </header>

      <div className="bento-grid">
        <PhoneTelemetryCard
          events={events}
          loading={loading}
          targetDate={dashboardDate}
          onOpen={() => setActiveView('telemetry')}
        />

        <SleepCard
          events={events}
          loading={loading}
          targetDate={dashboardDate}
          onOpen={() => setActiveView('sleep')}
        />


        {/* Your new Habit Tracker in Slot 04 */}
        <HabitsCard 
          onOpen={() => setActiveView('habits')} 
        />


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
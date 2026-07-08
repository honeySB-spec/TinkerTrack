import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Calendar, 
  BookOpen, 
  BarChart3, 
  ShieldAlert, 
  Moon, 
  Sun, 
  User, 
  Bell, 
  Check, 
  X,
  FastForward
} from 'lucide-react';
import ResourceCatalog from './components/ResourceCatalog';
import ReservationScheduler from './components/ReservationScheduler';
import BookingList from './components/BookingList';
import AnalyticsPanel from './components/AnalyticsPanel';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('catalog');
  const [theme, setTheme] = useState('dark');
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Fetch Users
  useEffect(() => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        if (data.length > 0) {
          // Default to Alice (Undergraduate)
          setCurrentUser(data[0]);
        }
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, []);

  // Fetch Notifications
  useEffect(() => {
    if (!currentUser) return;
    
    const fetchNotifications = () => {
      fetch(`/api/notifications?user_id=${currentUser.id}`)
        .then((res) => res.json())
        .then((data) => setNotifications(data))
        .catch((err) => console.error("Error fetching notifications:", err));
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [currentUser, reloadCounter]);

  // Handle Theme Toggle
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  };

  // Add Toast helper
  const showToast = (message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleReload = () => {
    setReloadCounter((prev) => prev + 1);
  };

  // Handle Waitlist Confirm
  const handleConfirmWaitlist = (waitlistId) => {
    fetch(`/api/waitlists/${waitlistId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast("Booking confirmed from waitlist!");
          handleReload();
        }
      });
  };

  // Handle Waitlist Reject
  const handleRejectWaitlist = (waitlistId) => {
    fetch(`/api/waitlists/${waitlistId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast("Declined slot successfully.");
          handleReload();
        }
      });
  };

  // Handle Admin Approve
  const handleAdminApprove = (bookingId) => {
    fetch(`/api/admin/reservations/${bookingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestor_id: currentUser.id })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast("Booking approved successfully.");
          handleReload();
        }
      });
  };

  // Handle Admin Reject
  const handleAdminReject = (bookingId) => {
    fetch(`/api/admin/reservations/${bookingId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestor_id: currentUser.id })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error);
        } else {
          showToast("Booking rejected.");
          handleReload();
        }
      });
  };

  // Trigger Fast Forward Timer (Test tool)
  const triggerFastForward = () => {
    fetch('/api/test/fast-forward', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        showToast(data.message);
        handleReload();
      });
  };

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <div style={{ fontFamily: 'monospace', color: '#fff' }}>INITIALIZING TINKERTRACK...</div>
      </div>
    );
  }

  const isAdmin = currentUser.role === 'Admin';

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="logo">
            TinkerTrack <span>v1.0</span>
          </div>

          <nav>
            <ul className="menu-list">
              <li className={`menu-item ${activeTab === 'catalog' ? 'active' : ''}`}>
                <button onClick={() => setActiveTab('catalog')}>
                  <BookOpen size={18} />
                  Catalog
                </button>
              </li>
              <li className={`menu-item ${activeTab === 'scheduler' ? 'active' : ''}`}>
                <button onClick={() => setActiveTab('scheduler')}>
                  <Calendar size={18} />
                  Availability
                </button>
              </li>
              <li className={`menu-item ${activeTab === 'bookings' ? 'active' : ''}`}>
                <button onClick={() => setActiveTab('bookings')}>
                  <Database size={18} />
                  My Bookings
                </button>
              </li>
              <li className={`menu-item ${activeTab === 'analytics' ? 'active' : ''}`}>
                <button onClick={() => setActiveTab('analytics')}>
                  <BarChart3 size={18} />
                  Analytics
                </button>
              </li>
              {isAdmin && (
                <li className={`menu-item ${activeTab === 'admin' ? 'active' : ''}`}>
                  <button onClick={() => setActiveTab('admin')}>
                    <ShieldAlert size={18} />
                    Admin Panel
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          {/* Active Testing Role Switcher */}
          <div className="role-switcher-card">
            <h4>Active User Simulator</h4>
            <select 
              className="role-select" 
              value={currentUser.id} 
              onChange={(e) => {
                const selected = users.find(u => u.id === parseInt(e.target.value));
                setCurrentUser(selected);
                showToast(`Switched to ${selected.name} (${selected.role})`);
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Test Controls */}
          <button className="theme-toggle-btn" onClick={triggerFastForward} title="Fast Forward waitlist timers by 15 mins to test expirations.">
            <FastForward size={14} />
            Fast Forward 15m
          </button>

          {/* Theme Switcher */}
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Banner Notifications (Actionable) */}
        {notifications.map((n) => (
          <div key={n.id} className="notification-banner">
            <div>
              <h4>{n.title}</h4>
              <p>{n.message}</p>
            </div>
            {n.actionable && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {n.actionType === 'waitlist_confirm' && (
                  <>
                    <button className="btn btn-secondary" onClick={() => handleConfirmWaitlist(n.waitlistId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                      <Check size={14} /> Claim Slot
                    </button>
                    <button className="btn btn-danger" onClick={() => handleRejectWaitlist(n.waitlistId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                      <X size={14} /> Decline
                    </button>
                  </>
                )}
                {n.actionType === 'admin_approve' && (
                  <>
                    <button className="btn btn-secondary" onClick={() => handleAdminApprove(n.bookingId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                      <Check size={14} /> Approve
                    </button>
                    <button className="btn btn-danger" onClick={() => handleAdminReject(n.bookingId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                      <X size={14} /> Reject
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Tab Components */}
        {activeTab === 'catalog' && (
          <ResourceCatalog 
            currentUser={currentUser} 
            showToast={showToast} 
            reloadCounter={reloadCounter}
            onReload={handleReload}
          />
        )}
        {activeTab === 'scheduler' && (
          <ReservationScheduler 
            currentUser={currentUser}
            reloadCounter={reloadCounter}
          />
        )}
        {activeTab === 'bookings' && (
          <BookingList 
            currentUser={currentUser} 
            showToast={showToast}
            reloadCounter={reloadCounter}
            onReload={handleReload}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsPanel 
            reloadCounter={reloadCounter}
          />
        )}
        {activeTab === 'admin' && isAdmin && (
          <AdminPanel 
            currentUser={currentUser} 
            showToast={showToast}
            reloadCounter={reloadCounter}
            onReload={handleReload}
          />
        )}
      </main>

      {/* Dynamic Slide-in Toast Notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

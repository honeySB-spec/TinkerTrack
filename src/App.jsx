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
  FastForward,
  LogOut,
  Sparkles
} from 'lucide-react';
import ResourceCatalog from './components/ResourceCatalog';
import ReservationScheduler from './components/ReservationScheduler';
import BookingList from './components/BookingList';
import AnalyticsPanel from './components/AnalyticsPanel';
import AdminPanel from './components/AdminPanel';
import LoginScreen from './components/LoginScreen';
import AiAssistant from './components/AiAssistant';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('tinkertrack_token') || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('catalog');
  const [theme, setTheme] = useState('dark');
  const [notifications, setNotifications] = useState([]);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('tinkertrack_theme') || 'dark';
    setTheme(savedTheme);
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, []);



  // Decode/Get current user profile if token is set
  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }
    
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) {
          handleLogout();
          throw new Error("Session expired.");
        }
        return res.json();
      })
      .then((data) => {
        setCurrentUser(data);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [token]);

  // Fetch Notifications
  useEffect(() => {
    if (!currentUser || !token) return;
    
    const fetchNotifications = () => {
      authFetch(`/api/notifications`)
        .then((res) => res.json())
        .then((data) => setNotifications(data))
        .catch((err) => console.error("Error fetching notifications:", err));
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [currentUser, token, reloadCounter]);

  // Auth helper: Custom authenticated fetch
  const authFetch = (url, options = {}) => {
    const activeToken = localStorage.getItem('tinkertrack_token') || token;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }
    return fetch(url, { ...options, headers }).then((res) => {
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        showToast("Session expired. Please log in again.");
        throw new Error("Authentication failed.");
      }
      return res;
    });
  };

  const handleLoginSuccess = (newToken, newUser) => {
    localStorage.setItem('tinkertrack_token', newToken);
    localStorage.setItem('tinkertrack_user', JSON.stringify(newUser));
    setToken(newToken);
    setCurrentUser(newUser);
    showToast(`Welcome back, ${newUser.name}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem('tinkertrack_token');
    localStorage.removeItem('tinkertrack_user');
    setToken(null);
    setCurrentUser(null);
    setActiveTab('catalog');
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('tinkertrack_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  };

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

  const handleReadNotif = (notifId) => {
    authFetch(`/api/notifications/${notifId}/read`, { method: 'POST' })
      .then(() => handleReload())
      .catch((err) => console.error("Error reading notification:", err));
  };

  const handleReadAllNotifs = () => {
    authFetch(`/api/notifications/read-all`, { method: 'POST' })
      .then(() => handleReload())
      .catch((err) => console.error("Error reading notifications:", err));
  };



  // Action: claim slot
  const handleConfirmWaitlist = (waitlistId) => {
    authFetch(`/api/waitlists/${waitlistId}/confirm`, {
      method: 'POST'
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

  // Action: decline slot
  const handleRejectWaitlist = (waitlistId) => {
    authFetch(`/api/waitlists/${waitlistId}/reject`, {
      method: 'POST'
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

  // Action: approve reservation
  const handleAdminApprove = (bookingId) => {
    authFetch(`/api/admin/reservations/${bookingId}/approve`, {
      method: 'POST'
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

  // Action: reject reservation
  const handleAdminReject = (bookingId) => {
    authFetch(`/api/admin/reservations/${bookingId}/reject`, {
      method: 'POST'
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

  const triggerFastForward = () => {
    authFetch('/api/test/fast-forward', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        showToast(data.message);
        handleReload();
      });
  };

  // Render Login screen if not authenticated
  if (!token || !currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const isAdmin = currentUser.role === 'Admin';

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="logo">
            TinkerTrack <span>v1.1</span>
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
              <li className={`menu-item ${activeTab === 'assistant' ? 'active' : ''}`}>
                <button onClick={() => setActiveTab('assistant')}>
                  <Sparkles size={18} style={{ color: 'var(--success-color)' }} />
                  AI Assistant
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


          {/* Test Controls */}
          <button className="theme-toggle-btn" onClick={triggerFastForward} title="Fast Forward waitlist timers by 15 mins to test expirations.">
            <FastForward size={14} />
            Fast Forward 15m
          </button>

          {/* Logout & Theme Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button className="theme-toggle-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="theme-toggle-btn" onClick={handleLogout} style={{ borderColor: 'var(--error-color)', color: 'var(--error-color)' }}>
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header Bar with User Details & Notification Bell */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Logged in as:</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{currentUser.name} ({currentUser.role})</span>
          </div>

          <div style={{ position: 'relative' }}>
            <button className="theme-toggle-btn" style={{ position: 'relative', border: '1px solid var(--border-color)', background: 'none', cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}>
              <Bell size={16} />
              <span>Alerts</span>
              {notifications.filter(n => !n.read).length > 0 && (
                <span style={{ backgroundColor: 'var(--error-color)', color: 'white', borderRadius: '50%', minWidth: '16px', height: '16px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', padding: '0 4px' }}>
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {notifDropdownOpen && (
              <div className="notif-dropdown" style={{ position: 'absolute', right: 0, top: '35px', width: '340px', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', boxShadow: '0 10px 30px var(--shadow-color)', zIndex: 100, padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notifications ({notifications.length})</h4>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <button style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); handleReadAllNotifs(); }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {notifications.map(n => (
                    <div key={n.id} style={{ padding: '0.6rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', opacity: n.read ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', cursor: 'pointer' }} onClick={() => handleReadNotif(n.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span style={{ color: n.read ? 'var(--text-secondary)' : 'var(--text-color)' }}>{n.title}</span>
                        {!n.read && <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--error-color)', borderRadius: '50%', display: 'inline-block' }}></span>}
                      </div>
                      <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.75rem' }}>{n.message}</p>
                      {n.actionable && !n.read && (
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                          {n.actionType === 'waitlist_confirm' && (
                            <>
                              <button className="btn" onClick={(e) => { e.stopPropagation(); handleConfirmWaitlist(n.actionData?.waitlistId || n.waitlistId); }} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Claim</button>
                              <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); handleRejectWaitlist(n.actionData?.waitlistId || n.waitlistId); }} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Decline</button>
                            </>
                          )}
                          {n.actionType === 'admin_approve' && (
                            <>
                              <button className="btn" onClick={(e) => { e.stopPropagation(); handleAdminApprove(n.actionData?.bookingId || n.bookingId); }} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Approve</button>
                              <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); handleAdminReject(n.actionData?.bookingId || n.bookingId); }} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Reject</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 1rem', fontSize: '0.8rem' }}>No notifications yet.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Banner Notifications (Actionable Alerts - Unread Only) */}
        {notifications.filter(n => n.actionable && !n.read).map((n) => (
          <div key={n.id} className="notification-banner">
            <div>
              <h4>{n.title}</h4>
              <p>{n.message}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {n.actionType === 'waitlist_confirm' && (
                <>
                  <button className="btn btn-secondary" onClick={() => handleConfirmWaitlist(n.actionData?.waitlistId || n.waitlistId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                    <Check size={14} /> Claim Slot
                  </button>
                  <button className="btn btn-danger" onClick={() => handleRejectWaitlist(n.actionData?.waitlistId || n.waitlistId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                    <X size={14} /> Decline
                  </button>
                </>
              )}
              {n.actionType === 'admin_approve' && (
                <>
                  <button className="btn btn-secondary" onClick={() => handleAdminApprove(n.actionData?.bookingId || n.bookingId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                    <Check size={14} /> Approve
                  </button>
                  <button className="btn btn-danger" onClick={() => handleAdminReject(n.actionData?.bookingId || n.bookingId)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                    <X size={14} /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Tab Components */}
        {activeTab === 'catalog' && (
          <ResourceCatalog 
            currentUser={currentUser} 
            showToast={showToast} 
            reloadCounter={reloadCounter}
            onReload={handleReload}
            authFetch={authFetch}
          />
        )}
        {activeTab === 'scheduler' && (
          <ReservationScheduler 
            currentUser={currentUser}
            reloadCounter={reloadCounter}
            authFetch={authFetch}
          />
        )}
        {activeTab === 'bookings' && (
          <BookingList 
            currentUser={currentUser} 
            showToast={showToast}
            reloadCounter={reloadCounter}
            onReload={handleReload}
            authFetch={authFetch}
          />
        )}
        {activeTab === 'assistant' && (
          <AiAssistant 
            currentUser={currentUser}
            showToast={showToast}
            authFetch={authFetch}
            onReload={handleReload}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsPanel 
            reloadCounter={reloadCounter}
            authFetch={authFetch}
          />
        )}
        {activeTab === 'admin' && isAdmin && (
          <AdminPanel 
            currentUser={currentUser} 
            showToast={showToast}
            reloadCounter={reloadCounter}
            onReload={handleReload}
            authFetch={authFetch}
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

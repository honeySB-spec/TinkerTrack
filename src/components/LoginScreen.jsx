import React, { useState } from 'react';
import { Lock, Mail, User, ShieldCheck } from 'lucide-react';

export default function LoginScreen({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister ? { name, email, password } : { email, password };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((data) => { throw new Error(data.error || "Authentication failed."); });
        }
        return res.json();
      })
      .then((data) => {
        onLoginSuccess(data.token, data.user);
      })
      .catch((err) => {
        setError(err.message);
      });
  };

  // Quick Switch accounts list to help testing
  const handleQuickLogin = (testEmail, testPassword) => {
    setError('');
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        onLoginSuccess(data.token, data.user);
      })
      .catch((err) => setError(err.message));
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-color)', padding: '1rem' }}>
      <div style={{ width: '400px', border: '1px solid var(--border-color)', backgroundColor: 'var(--panel-bg)', borderRadius: 'var(--radius)', padding: '2.5rem', boxShadow: '0 10px 30px var(--shadow-color)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', padding: '0.75rem', border: '2px solid var(--text-color)', borderRadius: '50%', marginBottom: '1rem' }}>
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            TinkerTrack Auth
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Secure Resource Management System
          </p>
        </div>

        {error && (
          <div style={{ border: '1px solid var(--error-color)', color: 'var(--error-color)', padding: '0.75rem 1rem', fontSize: '0.85rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)' }}>
            Error: {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isRegister && (
            <div className="form-group">
              <label>Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '32px' }}
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="email"
                className="form-control"
                style={{ paddingLeft: '32px' }}
                placeholder="you@tinkertrack.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="password"
                className="form-control"
                style={{ paddingLeft: '32px' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}>
            {isRegister ? 'Register Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button 
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isRegister ? 'Already have an account? Sign In' : 'Create new Undergraduate account'}
          </button>
        </div>

        {/* Developer Sandbox Switchers */}
        {!isRegister && (
          <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '0.05em' }}>
              <ShieldCheck size={14} /> Developer Sandbox Login
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ padding: '0.4rem', fontSize: '0.75rem' }} 
                onClick={() => handleQuickLogin('alice@tinkertrack.edu', 'pass123')}
              >
                Alice (Undergrad)
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ padding: '0.4rem', fontSize: '0.75rem' }} 
                onClick={() => handleQuickLogin('bob@tinkertrack.edu', 'pass123')}
              >
                Bob (Graduate)
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ padding: '0.4rem', fontSize: '0.75rem' }} 
                onClick={() => handleQuickLogin('charlie@tinkertrack.edu', 'pass123')}
              >
                Charlie (Staff)
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ padding: '0.4rem', fontSize: '0.75rem' }} 
                onClick={() => handleQuickLogin('admin@tinkertrack.edu', 'admin123')}
              >
                David (Admin)
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

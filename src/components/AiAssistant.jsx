import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Calendar, Check, AlertCircle, RefreshCw, HelpCircle, ArrowRight } from 'lucide-react';

export default function AiAssistant({ currentUser, showToast, authFetch, onReload }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: `Hi ${currentUser.name}! I am your TinkerTrack AI Scheduling Assistant. 

You can search for slots, request recommendations, or book resources using natural language!

Try typing something like:
• "Book Study Room A tomorrow at 10 AM for 2 hours"
• "Find available lab equipment today at 2 PM"
• "Suggest a tool for camera photography"
• "Is the Zeiss Electron Microscope open on Friday?"`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState([]);
  const [reservations, setReservations] = useState([]);
  
  // Suggested actions
  const suggestions = [
    "Book Study Room B tomorrow at 12:00 for 2 hours",
    "Is Conference Room available today at 4 PM?",
    "Suggest lab equipment",
    "Recommend a media gear item"
  ];

  const chatEndRef = useRef(null);

  useEffect(() => {
    // Load resources and reservations for local search
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => setResources(data.resources))
      .catch((err) => console.error(err));

    authFetch('/api/reservations')
      .then((res) => res.json())
      .then((data) => setReservations(data))
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = (textToSend) => {
    const query = textToSend || inputValue;
    if (!query.trim()) return;

    if (!textToSend) setInputValue('');

    // Add user message
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    authFetch('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ query })
    })
      .then((res) => res.json())
      .then((data) => {
        addAssistantResponse(data.text, data.action);
      })
      .catch((err) => {
        console.error("[AI Assistant] API call failed:", err);
        addAssistantResponse("⚠️ **Connection Error**: Failed to communicate with the AI microservice. Make sure the backend services are running and your Gemini API key is configured.");
      });
  };

  const addAssistantResponse = (text, actionPayload = null) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'assistant',
      text: text,
      timestamp: new Date(),
      action: actionPayload
    }]);
    setLoading(false);
  };

  // Perform Booking action
  const handleExecuteBooking = (resourceId, start, end) => {
    setLoading(true);
    authFetch('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        resource_id: resourceId,
        start_time: start,
        end_time: end
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setLoading(false);
        if (data.error) {
          showToast(data.error);
          addAssistantResponse(`Could not book: ${data.error}`);
        } else {
          showToast(`Booked successfully!`);
          addAssistantResponse(`🎉 **Reservation Confirmed!** I have reserved **${resources.find(r => r.id === resourceId)?.name}** for you from **${start}** to **${end}**.`);
          onReload();
        }
      })
      .catch((err) => {
        setLoading(false);
        console.error(err);
      });
  };

  // Perform Join Waitlist action
  const handleExecuteWaitlist = (resourceId, start, end) => {
    setLoading(true);
    authFetch('/api/waitlists', {
      method: 'POST',
      body: JSON.stringify({
        resource_id: resourceId,
        start_time: start,
        end_time: end
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setLoading(false);
        if (data.error) {
          showToast(data.error);
          addAssistantResponse(`Could not join waitlist: ${data.error}`);
        } else {
          showToast(`Joined waitlist successfully!`);
          addAssistantResponse(`📋 **Joined Waitlist Queue!** You have queued for **${resources.find(r => r.id === resourceId)?.name}** on **${start}** to **${end}**.`);
          onReload();
        }
      })
      .catch((err) => {
        setLoading(false);
        console.error(err);
      });
  };

  return (
    <div className="ai-assistant-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', backgroundColor: 'var(--panel-bg)', overflow: 'hidden' }}>
      
      {/* Assistant Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--text-color), var(--border-color))', border: '1px solid var(--border-color)' }}>
            <Sparkles size={16} style={{ color: 'var(--bg-color)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.95rem', margin: 0 }}>AI Scheduling Assistant</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Powered by TinkerNLP Engine</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--success-color)' }}>
          <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--success-color)', borderRadius: '50%' }}></span>
          Online
        </div>
      </div>

      {/* Messages list */}
      <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            
            {/* Bubble */}
            <div style={{ 
              padding: '0.85rem 1.1rem', 
              borderRadius: 'var(--radius)', 
              fontSize: '0.9rem', 
              lineHeight: 1.5,
              whiteSpace: 'pre-line',
              backgroundColor: m.sender === 'user' ? 'var(--accent-color)' : 'var(--card-bg)',
              color: m.sender === 'user' ? 'var(--bg-color)' : 'var(--text-color)',
              border: m.sender === 'user' ? 'none' : '1px solid var(--border-color)'
            }}>
              {m.text}
            </div>

            {/* Timestamp */}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', padding: '0 4px' }}>
              {m.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>

            {/* Action buttons (inline recommendations) */}
            {m.action && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {m.action.type === 'available' && (
                  <button 
                    className="btn" 
                    onClick={() => handleExecuteBooking(m.action.resource.id, m.action.start, m.action.end)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0.5rem 1rem' }}
                  >
                    <Check size={14} /> Book Resource Now
                  </button>
                )}
                {m.action.type === 'conflict' && (
                  <>
                    <button 
                      className="btn" 
                      onClick={() => handleExecuteWaitlist(m.action.resource.id, m.action.start, m.action.end)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0.5rem 1rem', borderColor: 'var(--border-color)' }}
                    >
                      <Calendar size={14} /> Join Waitlist Queue
                    </button>
                    {m.action.alternatives.map((alt) => (
                      <button
                        key={alt.id}
                        className="btn btn-secondary"
                        onClick={() => handleExecuteBooking(alt.id, m.action.start, m.action.end)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                        <ArrowRight size={12} /> Book Alternative: {alt.name}
                      </button>
                    ))}
                  </>
                )}
                {m.action.type === 'recommendation' && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handleSend(`Book ${m.action.resource.name} tomorrow at 10 AM`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0.5rem 1rem' }}
                  >
                    <Calendar size={14} /> Book tomorrow at 10:00
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', paddingLeft: '4px' }}>
            <RefreshCw size={12} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            Assistant is typing...
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Suggestion tags */}
      <div style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', overflowX: 'auto', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)' }}>
        {suggestions.map((s, idx) => (
          <button 
            key={idx} 
            onClick={() => handleSend(s)}
            style={{ 
              flexShrink: 0,
              backgroundColor: 'var(--accent-secondary)', 
              border: '1px solid var(--border-color)', 
              color: 'var(--text-color)', 
              borderRadius: '12px', 
              padding: '0.25rem 0.75rem', 
              fontSize: '0.75rem', 
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', padding: '0.75rem' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask AI Assistant or type command..."
          className="search-input"
          style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', margin: 0 }}
        />
        <button 
          type="submit" 
          className="btn" 
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '0 1.25rem' }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

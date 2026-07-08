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

    setTimeout(() => {
      processQuery(query);
    }, 800);
  };

  // Local rule-based NLP Parsing Engine
  const processQuery = (query) => {
    const q = query.toLowerCase();
    
    // 1. Identify category or resource
    let matchedResource = null;
    let matchedCategory = null;

    // Check resource names
    for (const res of resources) {
      if (q.includes(res.name.toLowerCase())) {
        matchedResource = res;
        break;
      }
    }

    // Fallbacks for common shorthand resource names
    if (!matchedResource) {
      if (q.includes("study room a") || q.includes("room a")) matchedResource = resources.find(r => r.id === 1);
      else if (q.includes("study room b") || q.includes("room b")) matchedResource = resources.find(r => r.id === 2);
      else if (q.includes("conference room") || q.includes("conference")) matchedResource = resources.find(r => r.id === 3);
      else if (q.includes("3d printer") || q.includes("printer") || q.includes("ultimaker")) matchedResource = resources.find(r => r.id === 4);
      else if (q.includes("microscope") || q.includes("zeiss") || q.includes("electron microscope")) matchedResource = resources.find(r => r.id === 5);
      else if (q.includes("oscilloscope") || q.includes("tektronix")) matchedResource = resources.find(r => r.id === 6);
      else if (q.includes("canon") || q.includes("camera") || q.includes("dslr")) matchedResource = resources.find(r => r.id === 7);
      else if (q.includes("projector") || q.includes("epson")) matchedResource = resources.find(r => r.id === 8);
    }

    // Check category keywords
    if (q.includes("meeting") || q.includes("room") || q.includes("space")) matchedCategory = { id: 1, name: "Meeting Spaces" };
    else if (q.includes("lab") || q.includes("equipment") || q.includes("scope") || q.includes("printer")) matchedCategory = { id: 2, name: "Lab Equipment" };
    else if (q.includes("media") || q.includes("gear") || q.includes("camera") || q.includes("projector") || q.includes("photo")) matchedCategory = { id: 3, name: "Media Gear" };

    // 2. Parse Date
    let date = new Date(); // default is today
    let dateLabel = "today";
    const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    
    if (q.includes("tomorrow")) {
      date.setDate(date.getDate() + 1);
      dateLabel = "tomorrow";
    } else if (q.includes("day after tomorrow")) {
      date.setDate(date.getDate() + 2);
      dateLabel = "the day after tomorrow";
    } else {
      for (let i = 0; i < 7; i++) {
        if (q.includes(daysOfWeek[i])) {
          const currentDay = date.getDay();
          const targetDay = i;
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7; // Next week's day
          date.setDate(date.getDate() + diff);
          dateLabel = daysOfWeek[i].charAt(0).toUpperCase() + daysOfWeek[i].slice(1);
          break;
        }
      }
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateYMD = `${year}-${month}-${dayStr}`;

    // 3. Parse Time and Duration
    let startHour = 10; // Default: 10:00
    let duration = 2;   // Default: 2 hours

    // Duration extraction: "for X hours"
    const durationMatch = q.match(/for\s+(\d+)\s*hour/);
    if (durationMatch) {
      duration = parseInt(durationMatch[1]);
    }

    // Time extraction: e.g. "at 2 PM", "at 14:00", "at 9 AM", "starts at 16"
    const timeMatch = q.match(/(?:at|starts?\s+at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/);
    if (timeMatch) {
      let hr = parseInt(timeMatch[1]);
      const ampm = timeMatch[3];
      if (ampm) {
        if (ampm.toLowerCase() === 'pm' && hr < 12) hr += 12;
        if (ampm.toLowerCase() === 'am' && hr === 12) hr = 0;
      }
      startHour = hr;
    }

    const endHour = startHour + duration;
    const startTimeStr = `${dateYMD} ${String(startHour).padStart(2, '0')}:00`;
    const endTimeStr = `${dateYMD} ${String(endHour).padStart(2, '0')}:00`;

    // 4. Recommendation Queries (e.g. "Suggest a room", "recommend lab equipment")
    if (q.includes("suggest") || q.includes("recommend")) {
      let filtered = resources;
      if (matchedCategory) {
        filtered = resources.filter(r => r.category_id === matchedCategory.id);
      }
      
      // Recommend available items first
      const availableItems = filtered.filter(r => r.status === 'Available');
      if (availableItems.length > 0) {
        const item = availableItems[Math.floor(Math.random() * availableItems.length)];
        addAssistantResponse(`Based on your request, I recommend the **${item.name}** (${item.category_name}).
        
*Description*: ${item.description}
*Status*: ${item.status}
*Access*: ${item.requires_approval ? "Requires Approval" : "Instant booking"}

Would you like to check its schedule or book it?`, {
          type: 'recommendation',
          resource: item
        });
      } else {
        addAssistantResponse("I couldn't find any currently available resources matching that description. However, you can browse all items in the Catalog.");
      }
      return;
    }

    // 5. Booking Actions
    if (matchedResource) {
      // Check for user role restrictions
      const restrictedRoles = JSON.parse(matchedResource.restricted_roles);
      if (restrictedRoles.includes(currentUser.role)) {
        addAssistantResponse(`⚠️ **Access Denied**: The resource **${matchedResource.name}** is restricted and cannot be booked by your role (**${currentUser.role}**).`);
        return;
      }

      // Check overlaps
      const overlap = reservations.find(r => 
        r.resource_id === matchedResource.id &&
        ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(r.status) &&
        r.start_time < endTimeStr &&
        r.end_time > startTimeStr
      );

      const displayTime = `${dateLabel} (${dateYMD}) from ${String(startHour).padStart(2, '0')}:00 to ${String(endHour).padStart(2, '0')}:00`;

      if (overlap) {
        // Find alternative resources in the same category
        const alternatives = resources.filter(r => 
          r.id !== matchedResource.id &&
          r.category_id === matchedResource.category_id &&
          r.status === 'Available' &&
          !reservations.some(resv => 
            resv.resource_id === r.id &&
            ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(resv.status) &&
            resv.start_time < endTimeStr &&
            resv.end_time > startTimeStr
          )
        );

        let altText = "";
        if (alternatives.length > 0) {
          altText = `\n\n**Alternative Available Resources during this slot:**\n` + 
            alternatives.map(a => `• **${a.name}** (Category: ${a.category_name})`).join('\n');
        }

        addAssistantResponse(`❌ **Timeslot Conflicted**: **${matchedResource.name}** is already booked for *${displayTime}* by ${overlap.user_name}.
        
Would you like to queue on the **Waitlist** for this slot? If the booking is cancelled, you'll be promoted according to your priority.${altText}`, {
          type: 'conflict',
          resource: matchedResource,
          start: startTimeStr,
          end: endTimeStr,
          alternatives: alternatives
        });
      } else {
        // Slot is available!
        addAssistantResponse(`✅ **Timeslot Available**: I've verified that **${matchedResource.name}** is available on *${displayTime}*.
        
Would you like to reserve it now?`, {
          type: 'available',
          resource: matchedResource,
          start: startTimeStr,
          end: endTimeStr
        });
      }
    } else {
      addAssistantResponse("I couldn't quite understand which resource or category you wanted. Could you specify the resource name (e.g. \"Study Room A\" or \"Canon Camera\") along with a date and time?");
    }
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

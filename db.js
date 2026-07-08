import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'tinkertrack.json');

// Default initial state
let data = {
  roles: [],
  users: [],
  categories: [],
  resources: [],
  reservations: [],
  waitlists: [],
  activity_logs: []
};

// Save helper
function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

// Load helper
function load() {
  if (fs.existsSync(dbPath)) {
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      console.error("Error reading database file, using empty data", e);
    }
  } else {
    seed();
    save();
  }
}

// Seeding initial data
function seed() {
  console.log("Database file not found. Seeding initial data...");

  // Seed Roles
  data.roles = [
    { id: 1, name: "Undergraduate", permissions: ["read", "reserve"] },
    { id: 2, name: "Graduate", permissions: ["read", "reserve", "bypass_approval"] },
    { id: 3, name: "Staff", permissions: ["read", "reserve", "bypass_approval", "unlimited_quota"] },
    { id: 4, name: "Admin", permissions: ["read", "reserve", "bypass_approval", "unlimited_quota", "admin"] }
  ];

  // Seed Users
  data.users = [
    { id: 1, role_id: 1, name: "Alice (Undergrad)", email: "alice@tinkertrack.edu", password_hash: "pass123" },
    { id: 2, role_id: 2, name: "Bob (Graduate)", email: "bob@tinkertrack.edu", password_hash: "pass123" },
    { id: 3, role_id: 3, name: "Charlie (Staff)", email: "charlie@tinkertrack.edu", password_hash: "pass123" },
    { id: 4, role_id: 4, name: "David (Admin)", email: "admin@tinkertrack.edu", password_hash: "admin123" }
  ];

  // Seed Categories
  data.categories = [
    { id: 1, name: "Meeting Spaces", description: "Rooms and areas for group work or study." },
    { id: 2, name: "Lab Equipment", description: "High-value laboratory instruments and tools." },
    { id: 3, name: "Media Gear", description: "Cameras, audio recorders, and presentation tools." }
  ];

  // Seed Resources
  data.resources = [
    { 
      id: 1, 
      category_id: 1, 
      name: "Study Room A", 
      status: "Available", 
      requires_approval: 0, 
      restricted_roles: [], 
      description: "Collaborative study room for up to 4 people. Has whiteboard." 
    },
    { 
      id: 2, 
      category_id: 1, 
      name: "Study Room B", 
      status: "Available", 
      requires_approval: 0, 
      restricted_roles: [], 
      description: "Collaborative study room for up to 6 people. Has TV screen." 
    },
    { 
      id: 3, 
      category_id: 1, 
      name: "Conference Room", 
      status: "Available", 
      requires_approval: 1, 
      restricted_roles: [], 
      description: "Large conference room. Requires approval for non-staff." 
    },
    { 
      id: 4, 
      category_id: 2, 
      name: "Ultimaker 3D Printer", 
      status: "Available", 
      requires_approval: 1, 
      restricted_roles: [], 
      description: "FDM 3D printer. High-demand resource, requires training approval." 
    },
    { 
      id: 5, 
      category_id: 2, 
      name: "Zeiss Electron Microscope", 
      status: "Available", 
      requires_approval: 1, 
      restricted_roles: ["Undergraduate"], 
      description: "Restricted to Graduates and Staff only. Requires admin approval." 
    },
    { 
      id: 6, 
      category_id: 2, 
      name: "Tektronix Oscilloscope", 
      status: "Available", 
      requires_approval: 0, 
      restricted_roles: [], 
      description: "100MHz Digital Oscilloscope for hardware debugging." 
    },
    { 
      id: 7, 
      category_id: 3, 
      name: "Canon EOS R5 DSLR", 
      status: "Available", 
      requires_approval: 0, 
      restricted_roles: [], 
      description: "High-resolution full-frame mirrorless camera with 24-70mm lens." 
    },
    { 
      id: 8, 
      category_id: 3, 
      name: "Epson 4K Projector", 
      status: "Available", 
      requires_approval: 0, 
      restricted_roles: [], 
      description: "Portable ultra-short throw projector." 
    }
  ];

  data.reservations = [];
  data.waitlists = [];
  data.activity_logs = [];
  console.log("Database seeded successfully!");
}

// Initial Load
load();

// --- Database Interface Methods ---

export default {
  // Save changes
  save,
  
  // Users
  getUsers() {
    return data.users.map(u => {
      const role = data.roles.find(r => r.id === u.role_id);
      return {
        ...u,
        role: role ? role.name : '',
        permissions: role ? JSON.stringify(role.permissions) : '[]'
      };
    });
  },

  getUserById(id) {
    const u = data.users.find(x => x.id === id);
    if (!u) return null;
    const role = data.roles.find(r => r.id === u.role_id);
    return {
      ...u,
      role_name: role ? role.name : '',
      permissions: role ? JSON.stringify(role.permissions) : '[]'
    };
  },

  // Categories
  getCategories() {
    return data.categories;
  },

  // Resources
  getResources() {
    return data.resources.map(r => {
      const cat = data.categories.find(c => c.id === r.category_id);
      return {
        ...r,
        category_name: cat ? cat.name : ''
      };
    });
  },

  getResourceById(id) {
    return data.resources.find(r => r.id === id) || null;
  },

  createResource(name, category_id, status, requires_approval, restricted_roles, description) {
    // Check unique
    if (data.resources.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Resource with name "${name}" already exists.`);
    }
    const id = data.resources.length > 0 ? Math.max(...data.resources.map(r => r.id)) + 1 : 1;
    const newRes = {
      id,
      category_id: parseInt(category_id),
      name,
      status,
      requires_approval: requires_approval ? 1 : 0,
      restricted_roles,
      description
    };
    data.resources.push(newRes);
    save();
    return id;
  },

  updateResource(id, name, category_id, status, requires_approval, restricted_roles, description) {
    const resIdx = data.resources.findIndex(r => r.id === parseInt(id));
    if (resIdx === -1) throw new Error("Resource not found.");
    
    // Check unique (excluding current)
    if (data.resources.some(r => r.id !== parseInt(id) && r.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Resource with name "${name}" already exists.`);
    }

    data.resources[resIdx] = {
      ...data.resources[resIdx],
      name,
      category_id: parseInt(category_id),
      status,
      requires_approval: requires_approval ? 1 : 0,
      restricted_roles,
      description
    };
    save();
  },

  deleteResource(id) {
    const resId = parseInt(id);
    data.resources = data.resources.filter(r => r.id !== resId);
    // clean up associated reservations/waitlists
    data.reservations = data.reservations.filter(r => r.resource_id !== resId);
    data.waitlists = data.waitlists.filter(w => w.resource_id !== resId);
    save();
  },

  // Reservations
  getReservations() {
    return data.reservations.map(r => {
      const u = data.users.find(x => x.id === r.user_id);
      const res = data.resources.find(x => x.id === r.resource_id);
      const cat = res ? data.categories.find(c => c.id === res.category_id) : null;
      return {
        ...r,
        user_name: u ? u.name : 'Unknown User',
        user_email: u ? u.email : '',
        resource_name: res ? res.name : 'Deleted Resource',
        category_name: cat ? cat.name : ''
      };
    });
  },

  getReservationById(id) {
    return data.reservations.find(r => r.id === parseInt(id)) || null;
  },

  createReservation(user_id, resource_id, start_time, end_time, status) {
    // Check overlaps
    const overlap = data.reservations.some(r => 
      r.resource_id === parseInt(resource_id) &&
      ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(r.status) &&
      r.start_time < end_time &&
      r.end_time > start_time
    );

    if (overlap && ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(status)) {
      throw new Error("overlaps with an existing active booking");
    }

    const id = data.reservations.length > 0 ? Math.max(...data.reservations.map(r => r.id)) + 1 : 1;
    const newResv = {
      id,
      user_id: parseInt(user_id),
      resource_id: parseInt(resource_id),
      start_time,
      end_time,
      status,
      version: 1,
      created_at: new Date().toISOString()
    };
    data.reservations.push(newResv);
    save();
    return id;
  },

  updateReservationStatus(id, status) {
    const resIdx = data.reservations.findIndex(r => r.id === parseInt(id));
    if (resIdx === -1) throw new Error("Reservation not found.");
    
    // Check overlap if changing status back to active (e.g. from Waitlist Promote)
    if (['Confirmed', 'PendingApproval'].includes(status)) {
      const current = data.reservations[resIdx];
      const overlap = data.reservations.some(r => 
        r.id !== current.id &&
        r.resource_id === current.resource_id &&
        ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(r.status) &&
        r.start_time < current.end_time &&
        r.end_time > current.start_time
      );
      if (overlap) {
        throw new Error("overlaps with an existing active booking");
      }
    }

    data.reservations[resIdx].status = status;
    data.reservations[resIdx].version += 1;
    save();
  },

  // Waitlists
  getWaitlists() {
    return data.waitlists.map(w => {
      const u = data.users.find(x => x.id === w.user_id);
      const res = data.resources.find(x => x.id === w.resource_id);
      return {
        ...w,
        user_name: u ? u.name : 'Unknown User',
        user_email: u ? u.email : '',
        resource_name: res ? res.name : 'Deleted Resource'
      };
    });
  },

  getWaitlistItemById(id) {
    return data.waitlists.find(w => w.id === parseInt(id)) || null;
  },

  createWaitlist(user_id, resource_id, start_time, end_time, priority_score) {
    const id = data.waitlists.length > 0 ? Math.max(...data.waitlists.map(w => w.id)) + 1 : 1;
    const newWait = {
      id,
      user_id: parseInt(user_id),
      resource_id: parseInt(resource_id),
      start_time,
      end_time,
      priority_score,
      status: 'Waiting',
      created_at: new Date().toISOString()
    };
    data.waitlists.push(newWait);
    save();
    return id;
  },

  updateWaitlistStatus(id, status, promoted_at = null) {
    const waitIdx = data.waitlists.findIndex(w => w.id === parseInt(id));
    if (waitIdx === -1) throw new Error("Waitlist item not found.");
    data.waitlists[waitIdx].status = status;
    if (promoted_at) {
      data.waitlists[waitIdx].promoted_at = promoted_at;
    }
    save();
  },

  // Activity Logs
  getActivityLogs(limit = 30) {
    return data.activity_logs
      .map(log => {
        const u = data.users.find(x => x.id === log.user_id);
        return {
          ...log,
          user_name: u ? u.name : 'System'
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  },

  logActivity(user_id, action, details) {
    const id = data.activity_logs.length > 0 ? Math.max(...data.activity_logs.map(l => l.id)) + 1 : 1;
    const newLog = {
      id,
      user_id: parseInt(user_id),
      action,
      details,
      timestamp: new Date().toISOString()
    };
    data.activity_logs.push(newLog);
    save();
  },

  // Quotas helper
  getActiveReservationsCount(userId) {
    return data.reservations.filter(r => 
      r.user_id === parseInt(userId) && 
      ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(r.status)
    ).length;
  },

  // Transaction simulation wrapper (since we are sync, we can just call it)
  transaction(fn) {
    return fn;
  }
};

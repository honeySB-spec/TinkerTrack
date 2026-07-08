import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// --- Concurrency Lock Manager ---
const resourceLocks = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireLock(resourceId, retries = 10, delay = 100) {
  for (let i = 0; i < retries; i++) {
    if (!resourceLocks.has(resourceId)) {
      resourceLocks.add(resourceId);
      return () => resourceLocks.delete(resourceId);
    }
    await sleep(delay);
  }
  return null;
}

// --- Helper Functions ---

// Check if role has a permission
function checkPermission(userId, permission) {
  const user = db.getUserById(parseInt(userId));
  if (!user) return false;
  const permissions = JSON.parse(user.permissions);
  return permissions.includes(permission);
}

// Trigger waitlist promotion when a slot becomes available
function promoteWaitlist(resourceId, startTime, endTime) {
  // Find all active waitlist entries for this resource that overlap with the freed slot
  const matches = db.getWaitlists()
    .filter(w => 
      w.resource_id === parseInt(resourceId) && 
      w.status === 'Waiting' && 
      w.start_time < endTime && 
      w.end_time > startTime
    )
    .sort((a, b) => b.priority_score - a.priority_score || a.created_at.localeCompare(b.created_at));

  if (matches.length === 0) return;

  // Let's promote the top match
  const topMatch = matches[0];
  
  // Check if the slot is still free
  const overlap = db.getReservations().some(r =>
    r.resource_id === parseInt(resourceId) &&
    ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(r.status) &&
    r.start_time < topMatch.end_time &&
    r.end_time > topMatch.start_time
  );
  if (overlap) return; // slot is already taken

  // Update waitlist status to Promoted
  db.updateWaitlistStatus(topMatch.id, 'Promoted', new Date().toISOString());

  // Create a temporary reservation for this user (status: PendingApproval, representing pending confirmation)
  db.createReservation(topMatch.user_id, resourceId, topMatch.start_time, topMatch.end_time, 'PendingApproval');

  db.logActivity(topMatch.user_id, "Waitlist Promoted", `Promoted to claim resource ID: ${resourceId} for ${topMatch.start_time} - ${topMatch.end_time}`);
}

// Scheduler to expire waitlist promotions that aren't confirmed in time
function checkWaitlistExpirations() {
  const now = new Date();
  
  // Find waitlists in Promoted status
  const promoted = db.getWaitlists().filter(w => w.status === 'Promoted');
  
  for (const item of promoted) {
    const promotedAt = new Date(item.promoted_at);
    const diffMinutes = (now - promotedAt) / (1000 * 60);
    
    if (diffMinutes >= 15) { // 15 minutes
      expireWaitlistPromotion(item);
    }
  }
}

function expireWaitlistPromotion(item) {
  // 1. Mark waitlist item as Expired
  db.updateWaitlistStatus(item.id, 'Expired');
  
  // 2. Find and cancel the temporary reservation created during promotion
  const tempResv = db.getReservations().find(r =>
    r.user_id === item.user_id &&
    r.resource_id === item.resource_id &&
    r.start_time === item.start_time &&
    r.end_time === item.end_time &&
    r.status === 'PendingApproval'
  );
  
  if (tempResv) {
    db.updateReservationStatus(tempResv.id, 'Cancelled');
  }
  
  db.logActivity(item.user_id, "Waitlist Expired", `Waitlist promotion expired for resource ID: ${item.resource_id}`);
  
  // 3. Promote the next waitlisted user for this resource/slot
  promoteWaitlist(item.resource_id, item.start_time, item.end_time);
}

// Run expiration check every 10 seconds
setInterval(checkWaitlistExpirations, 10000);

// --- REST API Endpoints ---

// 1. Users list for testing role switching
app.get('/api/users', (req, res) => {
  res.json(db.getUsers());
});

// 2. Resources Catalog (Categories + Resources)
app.get('/api/resources', (req, res) => {
  try {
    const resources = db.getResources();
    const categories = db.getCategories();
    res.json({ resources, categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create resource (Admin only)
app.post('/api/resources', (req, res) => {
  const { name, category_id, status, requires_approval, restricted_roles, description, requestor_id } = req.body;
  
  if (!checkPermission(requestor_id, 'admin')) {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  try {
    const id = db.createResource(name, category_id, status, requires_approval, restricted_roles, description);
    db.logActivity(requestor_id, "Create Resource", `Created resource ${name} (ID: ${id})`);
    res.status(201).json({ id, name, category_id, status, requires_approval, restricted_roles, description });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update resource (Admin only)
app.put('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const { name, category_id, status, requires_approval, restricted_roles, description, requestor_id } = req.body;
  
  if (!checkPermission(requestor_id, 'admin')) {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  try {
    db.updateResource(id, name, category_id, status, requires_approval, restricted_roles, description);
    db.logActivity(requestor_id, "Update Resource", `Updated resource ${name} (ID: ${id})`);
    res.json({ message: "Resource updated successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete resource (Admin only)
app.delete('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const { requestor_id } = req.body;
  
  if (!checkPermission(requestor_id, 'admin')) {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  try {
    db.deleteResource(id);
    db.logActivity(requestor_id, "Delete Resource", `Deleted resource ID: ${id}`);
    res.json({ message: "Resource deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Reservations list
app.get('/api/reservations', (req, res) => {
  try {
    res.json(db.getReservations());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Book a Resource
app.post('/api/reservations', async (req, res) => {
  const { user_id, resource_id, start_time, end_time } = req.body;

  // Basic Validation
  if (!user_id || !resource_id || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (new Date(start_time) >= new Date(end_time)) {
    return res.status(400).json({ error: "Start time must be before end time." });
  }

  // Get user details
  const user = db.getUserById(parseInt(user_id));
  if (!user) return res.status(404).json({ error: "User not found." });

  // Get resource details
  const resource = db.getResourceById(parseInt(resource_id));
  if (!resource) return res.status(404).json({ error: "Resource not found." });

  if (resource.status !== 'Available') {
    return res.status(400).json({ error: `Resource is currently ${resource.status} and cannot be reserved.` });
  }

  // Role Access Restriction Checks
  const restrictedRoles = JSON.parse(resource.restricted_roles);
  if (restrictedRoles.includes(user.role_name)) {
    return res.status(403).json({ error: `Access Denied: Your role (${user.role_name}) is restricted from booking this resource.` });
  }

  // Quota Checks
  const userPermissions = JSON.parse(user.permissions);
  if (!userPermissions.includes('unlimited_quota')) {
    const activeCount = db.getActiveReservationsCount(user_id);
    const maxQuota = user.role_name === 'Undergraduate' ? 2 : 5; // Undergraduate: 2, Graduate: 5
    if (activeCount >= maxQuota) {
      return res.status(403).json({ 
        error: `Booking Quota Exceeded: You have ${activeCount}/${maxQuota} active bookings. Delete or complete old bookings first.` 
      });
    }
  }

  // Concurrency Strategy Layer 1: In-Memory Mutex Lock
  const releaseLock = await acquireLock(resource_id);
  if (!releaseLock) {
    return res.status(409).json({ error: "System is busy processing requests for this resource. Please try again." });
  }

  try {
    // Check approval workflows
    let status = 'Confirmed';
    if (resource.requires_approval === 1 && !userPermissions.includes('bypass_approval')) {
      status = 'PendingApproval';
    }

    // Layer 3: Database overlap check logic executes during write operation
    const reservationId = db.createReservation(user_id, resource_id, start_time, end_time, status);
    
    db.logActivity(user_id, "Create Reservation", `Reserved ${resource.name} for ${start_time} - ${end_time} [Status: ${status}]`);
    
    res.status(201).json({ id: reservationId, user_id, resource_id, start_time, end_time, status });

  } catch (error) {
    if (error.message.includes('overlaps with an existing active booking')) {
      res.status(409).json({ error: "Reservation conflict: The selected timeslot overlaps with an existing booking." });
    } else {
      res.status(500).json({ error: error.message });
    }
  } finally {
    // Release lock
    releaseLock();
  }
});

// Check in (starts reservation)
app.put('/api/reservations/:id/checkin', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  
  try {
    const booking = db.getReservationById(id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.user_id !== parseInt(user_id) && !checkPermission(user_id, 'admin')) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    if (booking.status !== 'Confirmed') {
      return res.status(400).json({ error: `Cannot check in. Status is ${booking.status}.` });
    }
    
    db.updateReservationStatus(id, 'CheckedIn');
    db.logActivity(user_id, "Check In", `Checked into reservation ID: ${id}`);
    res.json({ message: "Checked in successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete reservation
app.put('/api/reservations/:id/complete', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  
  try {
    const booking = db.getReservationById(id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.user_id !== parseInt(user_id) && !checkPermission(user_id, 'admin')) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    if (booking.status !== 'CheckedIn') {
      return res.status(400).json({ error: "Can only complete reservations that are checked in." });
    }
    
    db.updateReservationStatus(id, 'Completed');
    db.logActivity(user_id, "Complete Reservation", `Completed reservation ID: ${id}`);
    res.json({ message: "Reservation completed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel reservation (triggers waitlist)
app.put('/api/reservations/:id/cancel', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  
  try {
    const booking = db.getReservationById(id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.user_id !== parseInt(user_id) && !checkPermission(user_id, 'admin')) {
      return res.status(403).json({ error: "Unauthorized." });
    }
    if (['Completed', 'Cancelled'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a ${booking.status} reservation.` });
    }
    
    db.updateReservationStatus(id, 'Cancelled');
    db.logActivity(user_id, "Cancel Reservation", `Cancelled reservation ID: ${id}`);
    
    // Promote the next user in the waitlist for this block
    promoteWaitlist(booking.resource_id, booking.start_time, booking.end_time);
    
    res.json({ message: "Reservation cancelled successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Waitlist Endpoints

// Get active waitlist entries
app.get('/api/waitlists', (req, res) => {
  try {
    res.json(db.getWaitlists());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join Waitlist
app.post('/api/waitlists', (req, res) => {
  const { user_id, resource_id, start_time, end_time } = req.body;
  
  if (!user_id || !resource_id || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const user = db.getUserById(parseInt(user_id));
    if (!user) return res.status(404).json({ error: "User not found." });

    // Priority Score formula:
    // Base scores: Undergraduate=10, Graduate=20, Staff=30, Admin=40
    let baseScore = 10;
    if (user.role_name === 'Graduate') baseScore = 20;
    if (user.role_name === 'Staff') baseScore = 30;
    if (user.role_name === 'Admin') baseScore = 40;

    // Small modifier to prioritize users with fewer bookings (fair-use)
    const bookingCount = db.getReservations().filter(r => r.user_id === user.id).length;
    const priorityScore = baseScore - bookingCount; // Less prior usage = higher priority

    db.createWaitlist(user_id, resource_id, start_time, end_time, priorityScore);

    db.logActivity(user_id, "Join Waitlist", `Joined waitlist for resource ID: ${resource_id} [Priority: ${priorityScore}]`);
    res.status(201).json({ message: "Successfully joined waitlist." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm waitlist promotion
app.post('/api/waitlists/:id/confirm', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  
  try {
    const item = db.getWaitlistItemById(id);
    if (!item) return res.status(404).json({ error: "Waitlist item not found." });
    if (item.user_id !== parseInt(user_id)) return res.status(403).json({ error: "Unauthorized." });
    if (item.status !== 'Promoted') return res.status(400).json({ error: "Waitlist entry is not promoted." });

    db.updateWaitlistStatus(id, 'Promoted'); // Closed/Completed
    
    // Find the temporary reservation and confirm it
    const booking = db.getReservations().find(r =>
      r.user_id === item.user_id &&
      r.resource_id === item.resource_id &&
      r.start_time === item.start_time &&
      r.end_time === item.end_time &&
      r.status === 'PendingApproval'
    );

    if (booking) {
      db.updateReservationStatus(booking.id, 'Confirmed');
    }

    db.logActivity(user_id, "Confirm Waitlist Booking", `Confirmed waitlist slot for resource ID: ${item.resource_id}`);

    res.json({ message: "Reservation confirmed successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject waitlist promotion
app.post('/api/waitlists/:id/reject', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  try {
    const item = db.getWaitlistItemById(id);
    if (!item) return res.status(404).json({ error: "Waitlist item not found." });
    if (item.user_id !== parseInt(user_id)) return res.status(403).json({ error: "Unauthorized." });
    if (item.status !== 'Promoted' && item.status !== 'Waiting') {
      return res.status(400).json({ error: "Waitlist entry is not in active state." });
    }

    expireWaitlistPromotion(item);
    res.json({ message: "Declined promotion successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Admin Approvals Endpoints
app.post('/api/admin/reservations/:id/approve', (req, res) => {
  const { id } = req.params;
  const { requestor_id } = req.body;

  if (!checkPermission(requestor_id, 'admin')) {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  try {
    db.updateReservationStatus(id, 'Confirmed');
    const booking = db.getReservationById(id);
    db.logActivity(requestor_id, "Approve Booking", `Approved booking ID: ${id} for user ID: ${booking.user_id}`);
    res.json({ message: "Booking approved successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reservations/:id/reject', (req, res) => {
  const { id } = req.params;
  const { requestor_id } = req.body;

  if (!checkPermission(requestor_id, 'admin')) {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  try {
    db.updateReservationStatus(id, 'Cancelled');
    db.logActivity(requestor_id, "Reject Booking", `Rejected/Cancelled booking ID: ${id}`);
    res.json({ message: "Booking rejected successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Analytics Endpoint
app.get('/api/analytics', (req, res) => {
  try {
    const resources = db.getResources();
    const reservations = db.getReservations();

    // 1. Total bookings by resource
    const bookingsByResource = resources.map(res => {
      const count = reservations.filter(r => r.resource_id === res.id && r.status !== 'Cancelled').length;
      return { name: res.name, count };
    });

    // 2. Resource utilization rate (simulated relative calculation)
    const utilization = resources.map(res => {
      const resvHours = reservations
        .filter(r => r.resource_id === res.id && ['Confirmed', 'CheckedIn', 'Completed'].includes(r.status))
        .reduce((sum, r) => {
          const hours = (new Date(r.end_time) - new Date(r.start_time)) / (1000 * 60 * 60);
          return sum + (isNaN(hours) ? 0 : hours);
        }, 0);
      const rate = Math.min(Math.round((resvHours / 84) * 100), 100); // 84 hours max capacity simulation
      return { name: res.name, utilization: rate };
    });

    // 3. Peak hours distribution
    const hoursCount = {};
    reservations.filter(r => r.status !== 'Cancelled').forEach(r => {
      // start_time is "YYYY-MM-DD HH:MM", slice hour
      const hour = r.start_time.split(' ')[1]?.split(':')[0] || '10';
      hoursCount[hour] = (hoursCount[hour] || 0) + 1;
    });

    const peakHours = Object.keys(hoursCount).map(hour => ({
      hour,
      count: hoursCount[hour]
    })).sort((a, b) => a.hour.localeCompare(b.hour));

    // 4. Log activities
    const logs = db.getActivityLogs(30);

    res.json({ bookingsByResource, utilization, peakHours, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Dynamic Notifications list
app.get('/api/notifications', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "User ID required." });

  try {
    const notifications = [];
    const now = new Date();
    
    // Format current date matching timeslots
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const nowStr = `${year}-${month}-${day} ${hour}:${min}`;

    // Get active user details
    const user = db.getUserById(parseInt(user_id));
    if (!user) return res.status(404).json({ error: "User not found." });

    // A. Check for promoted waitlists
    const promotedWaitlists = db.getWaitlists().filter(w => w.user_id === user.id && w.status === 'Promoted');

    for (const item of promotedWaitlists) {
      notifications.push({
        id: `waitlist_${item.id}`,
        type: 'WAITLIST_PROMOTION',
        title: 'Waitlist Promoted!',
        message: `Your waitlist slot for "${item.resource_name}" (${item.start_time} - ${item.end_time}) has opened up. You have 15 minutes to claim it!`,
        actionable: true,
        actionType: 'waitlist_confirm',
        waitlistId: item.id
      });
    }

    // B. Check for upcoming bookings (starts within 2 hours)
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const thYear = twoHoursLater.getFullYear();
    const thMonth = String(twoHoursLater.getMonth() + 1).padStart(2, '0');
    const thDay = String(twoHoursLater.getDate()).padStart(2, '0');
    const thHour = String(twoHoursLater.getHours()).padStart(2, '0');
    const thMin = String(twoHoursLater.getMinutes()).padStart(2, '0');
    const twoHoursLaterStr = `${thYear}-${thMonth}-${thDay} ${thHour}:${thMin}`;

    const upcomingBookings = db.getReservations().filter(r => 
      r.user_id === user.id && 
      r.status === 'Confirmed' &&
      r.start_time >= nowStr && 
      r.start_time <= twoHoursLaterStr
    );

    for (const item of upcomingBookings) {
      notifications.push({
        id: `upcoming_${item.id}`,
        type: 'UPCOMING_RESERVATION',
        title: 'Upcoming Reservation',
        message: `Your reservation for "${item.resource_name}" starts at ${item.start_time}. Remember to check in!`,
        actionable: false
      });
    }

    // C. Admin notifications (pending approvals)
    const isAdmin = checkPermission(user_id, 'admin');
    if (isAdmin) {
      const pendingApprovals = db.getReservations().filter(r => r.status === 'PendingApproval');

      for (const item of pendingApprovals) {
        notifications.push({
          id: `pending_${item.id}`,
          type: 'PENDING_APPROVAL',
          title: 'Pending Admin Approval',
          message: `User ${item.user_name} has requested "${item.resource_name}" for ${item.start_time} - ${item.end_time}.`,
          actionable: true,
          actionType: 'admin_approve',
          bookingId: item.id
        });
      }
    }

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Test helper: Fast-forward promoted waitlist items by 15 mins to expire them
app.post('/api/test/fast-forward', (req, res) => {
  try {
    const promoted = db.getWaitlists().filter(w => w.status === 'Promoted');
    let count = 0;
    for (const item of promoted) {
      // Set the promoted_at time back by 16 minutes, so the next expiration check will catch it
      const oldDate = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      db.updateWaitlistStatus(item.id, 'Promoted', oldDate);
      count++;
    }
    
    // Trigger expiration check manually
    checkWaitlistExpirations();
    
    res.json({ message: `Fast-forwarded ${count} promoted waitlist items by 15 minutes.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`TinkerTrack API Server running on http://localhost:${PORT}`);
});

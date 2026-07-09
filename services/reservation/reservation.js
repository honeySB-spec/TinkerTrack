import express from 'express';
import { getDb, getRedis, getRabbitChannel } from '../shared/shared.js';

const app = express();
app.use(express.json());
const PORT = 5030;

const pool = getDb();

// Helper to format Date for DB comparison and response
function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 1. Get Reservations
app.get('/api/reservations', async (req, res) => {
  try {
    const reservationsRes = await pool.query(
      `SELECT r.id, r.user_id, r.resource_id, r.start_time, r.end_time, r.status, res.name as resource_name 
       FROM reservations r 
       JOIN resources res ON r.resource_id = res.id 
       ORDER BY r.id ASC`
    );
    const formatted = reservationsRes.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      resource_id: row.resource_id,
      start_time: formatDateTime(new Date(row.start_time)),
      end_time: formatDateTime(new Date(row.end_time)),
      status: row.status,
      resource_name: row.resource_name
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Book a Resource
app.post('/api/reservations', async (req, res) => {
  const { resource_id, start_time, end_time } = req.body;
  const user_id = parseInt(req.header('X-User-Id'));
  const user_role = req.header('X-User-Role');

  if (!resource_id || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (new Date(start_time) >= new Date(end_time)) {
    return res.status(400).json({ error: "Start time must be before end time." });
  }

  try {
    // Check if user exists
    const userRes = await pool.query(
      `SELECT u.id, u.name, r.name as role_name, r.permissions 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [user_id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const user = userRes.rows[0];

    // Check if resource exists
    const resRes = await pool.query("SELECT * FROM resources WHERE id = $1", [resource_id]);
    if (resRes.rows.length === 0) {
      return res.status(404).json({ error: "Resource not found." });
    }
    const resource = resRes.rows[0];

    if (resource.status !== 'Available') {
      return res.status(400).json({ error: `Resource is currently ${resource.status} and cannot be reserved.` });
    }

    // Role Restriction Checks
    if (resource.restricted_roles.includes(user_role)) {
      return res.status(403).json({ error: `Access Denied: Your role (${user_role}) is restricted from booking this resource.` });
    }

    // Quota Checks
    if (!user.permissions.includes('unlimited_quota')) {
      const activeCountRes = await pool.query(
        `SELECT COUNT(*) FROM reservations 
         WHERE user_id = $1 AND status IN ('Confirmed', 'PendingApproval', 'CheckedIn')`,
        [user_id]
      );
      const activeCount = parseInt(activeCountRes.rows[0].count);

      const quotasRes = await pool.query("SELECT value FROM settings WHERE key = 'quotas'");
      const quotas = quotasRes.rows[0].value;
      const maxQuota = quotas[user_role] !== undefined ? quotas[user_role] : (user_role === 'Undergraduate' ? 2 : 5);

      if (activeCount >= maxQuota) {
        return res.status(403).json({ 
          error: `Booking Quota Exceeded: You have ${activeCount}/${maxQuota} active bookings. Delete or complete old bookings first.` 
        });
      }
    }

    // Concurrency Lock: Redis
    let redisClient;
    let lockAcquired = false;
    const lockKey = `lock:resource:${resource_id}`;
    
    try {
      redisClient = await getRedis();
      // Try to set key with NX (Not Exists) and EX 5 (5 seconds expiration)
      const resLock = await redisClient.set(lockKey, 'locked', { NX: true, EX: 5 });
      if (resLock === 'OK') {
        lockAcquired = true;
      }
    } catch (redisErr) {
      console.error("[Redis] Locking error, defaulting to database constraint:", redisErr.message);
      // Fall back to database constraint
      lockAcquired = true;
    }

    if (!lockAcquired) {
      return res.status(409).json({ error: "System is busy processing requests for this resource. Please try again." });
    }

    try {
      let bookingStatus = 'Confirmed';
      if (resource.requires_approval && !user.permissions.includes('bypass_approval')) {
        bookingStatus = 'PendingApproval';
      }

      // Check overlap before writing (Layer 2 database level simulation)
      const overlapRes = await pool.query(
        `SELECT * FROM reservations 
         WHERE resource_id = $1 
           AND status IN ('Confirmed', 'PendingApproval', 'CheckedIn')
           AND start_time < $2 
           AND end_time > $3`,
        [resource_id, end_time, start_time]
      );

      if (overlapRes.rows.length > 0) {
        throw new Error("overlaps with an existing active booking");
      }

      // Insert reservation
      const insertRes = await pool.query(
        `INSERT INTO reservations (user_id, resource_id, start_time, end_time, status) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user_id, resource_id, start_time, end_time, bookingStatus]
      );

      const reservationId = insertRes.rows[0].id;

      // Publish events to RabbitMQ
      try {
        const channel = await getRabbitChannel();
        const eventPayload = JSON.stringify({
          id: reservationId,
          user_id,
          resource_id: parseInt(resource_id),
          resource_name: resource.name,
          start_time,
          end_time,
          status: bookingStatus
        });
        channel.publish('tinkertrack_events', 'booking.created', Buffer.from(eventPayload));

        const logMessage = JSON.stringify({
          userId: user_id,
          action: "Create Reservation",
          details: `Reserved ${resource.name} for ${start_time} - ${end_time} [Status: ${bookingStatus}]`
        });
        channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
      } catch (mqErr) {
        console.error("[RabbitMQ] Error publishing booking events:", mqErr.message);
      }

      res.status(201).json({
        id: reservationId,
        user_id,
        resource_id: parseInt(resource_id),
        start_time,
        end_time,
        status: bookingStatus
      });

    } finally {
      if (redisClient && lockAcquired) {
        await redisClient.del(lockKey);
      }
    }

  } catch (error) {
    if (error.message.includes('overlaps with an existing active booking') || error.message.includes('no_overlapping_bookings')) {
      res.status(409).json({ error: "Reservation conflict: The selected timeslot overlaps with an existing booking." });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 3. Check in
app.put('/api/reservations/:id/checkin', async (req, res) => {
  const { id } = req.params;
  const user_id = parseInt(req.header('X-User-Id'));
  const user_role = req.header('X-User-Role');

  try {
    const bookingRes = await pool.query("SELECT * FROM reservations WHERE id = $1", [id]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }
    const booking = bookingRes.rows[0];

    if (booking.user_id !== user_id && user_role !== 'Admin') {
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (booking.status !== 'Confirmed') {
      return res.status(400).json({ error: `Cannot check in. Status is ${booking.status}.` });
    }

    await pool.query("UPDATE reservations SET status = 'CheckedIn' WHERE id = $1", [id]);

    // Publish to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const eventPayload = JSON.stringify({ id: parseInt(id), user_id: booking.user_id });
      channel.publish('tinkertrack_events', 'booking.checkedin', Buffer.from(eventPayload));

      const logMessage = JSON.stringify({
        userId: user_id,
        action: "Check In",
        details: `Checked into reservation ID: ${id}`
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing check-in event:", mqErr.message);
    }

    res.json({ message: "Checked in successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Complete
app.put('/api/reservations/:id/complete', async (req, res) => {
  const { id } = req.params;
  const user_id = parseInt(req.header('X-User-Id'));
  const user_role = req.header('X-User-Role');

  try {
    const bookingRes = await pool.query("SELECT * FROM reservations WHERE id = $1", [id]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }
    const booking = bookingRes.rows[0];

    if (booking.user_id !== user_id && user_role !== 'Admin') {
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (booking.status !== 'CheckedIn') {
      return res.status(400).json({ error: "Can only complete reservations that are checked in." });
    }

    await pool.query("UPDATE reservations SET status = 'Completed' WHERE id = $1", [id]);

    // Publish to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const eventPayload = JSON.stringify({ id: parseInt(id), user_id: booking.user_id });
      channel.publish('tinkertrack_events', 'booking.completed', Buffer.from(eventPayload));

      const logMessage = JSON.stringify({
        userId: user_id,
        action: "Complete Reservation",
        details: `Completed reservation ID: ${id}`
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing completion event:", mqErr.message);
    }

    res.json({ message: "Reservation completed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Cancel
app.put('/api/reservations/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const user_id = parseInt(req.header('X-User-Id'));
  const user_role = req.header('X-User-Role');

  try {
    const bookingRes = await pool.query("SELECT * FROM reservations WHERE id = $1", [id]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }
    const booking = bookingRes.rows[0];

    if (booking.user_id !== user_id && user_role !== 'Admin') {
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (['Completed', 'Cancelled'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a ${booking.status} reservation.` });
    }

    await pool.query("UPDATE reservations SET status = 'Cancelled' WHERE id = $1", [id]);

    // Publish to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const eventPayload = JSON.stringify({
        resourceId: booking.resource_id,
        startTime: formatDateTime(new Date(booking.start_time)),
        endTime: formatDateTime(new Date(booking.end_time)),
        id: booking.id,
        user_id: booking.user_id
      });
      channel.publish('tinkertrack_events', 'booking.cancelled', Buffer.from(eventPayload));

      const logMessage = JSON.stringify({
        userId: user_id,
        action: "Cancel Reservation",
        details: `Cancelled reservation ID: ${id}`
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing cancellation event:", mqErr.message);
    }

    res.json({ message: "Reservation cancelled successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Intelligent Suggestions: Alternatives
app.get('/api/resources/:id/alternatives', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { start_time, end_time } = req.query;

    if (!start_time || !end_time) {
      return res.status(400).json({ error: "Missing start_time or end_time." });
    }

    const resRes = await pool.query("SELECT * FROM resources WHERE id = $1", [id]);
    if (resRes.rows.length === 0) {
      return res.status(404).json({ error: "Resource not found." });
    }
    const resource = resRes.rows[0];

    const allResourcesRes = await pool.query("SELECT * FROM resources ORDER BY id ASC");
    const allReservationsRes = await pool.query("SELECT * FROM reservations ORDER BY id ASC");

    const allResources = allResourcesRes.rows;
    const allReservations = allReservationsRes.rows.map(row => ({
      ...row,
      start_time: formatDateTime(new Date(row.start_time)),
      end_time: formatDateTime(new Date(row.end_time))
    }));

    // Find other available resources of same category for exact timeslot
    const availableAlternativeResources = allResources.filter(r => 
      r.id !== id &&
      r.category_id === resource.category_id &&
      r.status === 'Available' &&
      !allReservations.some(resv => 
        resv.resource_id === r.id &&
        ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(resv.status) &&
        resv.start_time < end_time &&
        resv.end_time > start_time
      )
    ).map(r => ({
      id: r.id,
      category_id: r.category_id,
      name: r.name,
      status: r.status,
      requires_approval: r.requires_approval ? 1 : 0,
      restricted_roles: JSON.stringify(r.restricted_roles),
      description: r.description
    }));

    // Find next 3 alternative free timeslots for the same resource
    const availableAlternativeSlots = [];
    const dateCenter = new Date(start_time.split(' ')[0]);
    const testDays = [0, 1, 2];
    const candidateSlots = [
      { start: '08:00', end: '10:00' },
      { start: '10:00', end: '12:00' },
      { start: '12:00', end: '14:00' },
      { start: '14:00', end: '16:00' },
      { start: '16:00', end: '18:00' },
      { start: '18:00', end: '20:00' }
    ];

    for (const dayOffset of testDays) {
      const d = new Date(dateCenter);
      d.setDate(d.getDate() + dayOffset);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      for (const slot of candidateSlots) {
        const slotStart = `${dateStr} ${slot.start}`;
        const slotEnd = `${dateStr} ${slot.end}`;

        const now = new Date();
        const slotStartDate = new Date(slotStart.replace(' ', 'T'));
        if (slotStartDate < now) continue;

        const overlap = allReservations.some(resv => 
          resv.resource_id === id &&
          ['Confirmed', 'PendingApproval', 'CheckedIn'].includes(resv.status) &&
          resv.start_time < slotEnd &&
          resv.end_time > slotStart
        );

        if (!overlap) {
          const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${slot.start} - ${slot.end}`;
          availableAlternativeSlots.push({ start_time: slotStart, end_time: slotEnd, label });
          if (availableAlternativeSlots.length >= 3) break;
        }
      }
      if (availableAlternativeSlots.length >= 3) break;
    }

    res.json({ availableAlternativeResources, availableAlternativeSlots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Admin approvals
app.post('/api/admin/reservations/:id/approve', async (req, res) => {
  const role = req.header('X-User-Role');
  const adminId = parseInt(req.header('X-User-Id'));
  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const { id } = req.params;

  try {
    await pool.query("UPDATE reservations SET status = 'Confirmed' WHERE id = $1", [id]);
    
    // Fetch details
    const bookingRes = await pool.query(
      `SELECT r.*, res.name as resource_name FROM reservations r 
       JOIN resources res ON r.resource_id = res.id 
       WHERE r.id = $1`, [id]
    );

    if (bookingRes.rows.length > 0) {
      const booking = bookingRes.rows[0];

      // Publish Event to RabbitMQ
      try {
        const channel = await getRabbitChannel();
        const eventPayload = JSON.stringify({
          userId: booking.user_id,
          type: "BOOKING_APPROVED",
          title: "Booking Approved!",
          message: `Your reservation for "${booking.resource_name}" starting at ${formatDateTime(new Date(booking.start_time))} has been APPROVED by an admin.`,
          actionable: false,
          actionType: null,
          actionData: { bookingId: booking.id }
        });
        channel.publish('tinkertrack_events', 'booking.approved', Buffer.from(eventPayload));

        const logMessage = JSON.stringify({
          userId: adminId,
          action: "Approve Booking",
          details: `Approved booking ID: ${id} for user ID: ${booking.user_id}`
        });
        channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
      } catch (mqErr) {
        console.error("[RabbitMQ] Error publishing booking approval event:", mqErr.message);
      }
    }

    res.json({ message: "Booking approved successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reservations/:id/reject', async (req, res) => {
  const role = req.header('X-User-Role');
  const adminId = parseInt(req.header('X-User-Id'));
  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const { id } = req.params;

  try {
    const bookingRes = await pool.query(
      `SELECT r.*, res.name as resource_name FROM reservations r 
       JOIN resources res ON r.resource_id = res.id 
       WHERE r.id = $1`, [id]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }

    const booking = bookingRes.rows[0];
    await pool.query("UPDATE reservations SET status = 'Cancelled' WHERE id = $1", [id]);

    // Publish Event to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const eventPayload = JSON.stringify({
        userId: booking.user_id,
        type: "BOOKING_REJECTED",
        title: "Booking Rejected",
        message: `Your reservation request for "${booking.resource_name}" starting at ${formatDateTime(new Date(booking.start_time))} was rejected by an admin.`,
        actionable: false,
        actionType: null,
        actionData: { bookingId: booking.id }
      });
      channel.publish('tinkertrack_events', 'booking.rejected', Buffer.from(eventPayload));

      const logMessage = JSON.stringify({
        userId: adminId,
        action: "Reject Booking",
        details: `Rejected/Cancelled booking ID: ${id}`
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing booking rejection event:", mqErr.message);
    }

    res.json({ message: "Booking rejected successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Admin Settings
app.get('/api/admin/settings', async (req, res) => {
  const role = req.header('X-User-Role');
  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  try {
    const quotasRes = await pool.query("SELECT value FROM settings WHERE key = 'quotas'");
    const weightsRes = await pool.query("SELECT value FROM settings WHERE key = 'priorityWeights'");
    const ttlRes = await pool.query("SELECT value FROM settings WHERE key = 'waitlistTtlMinutes'");

    res.json({
      quotas: quotasRes.rows[0].value,
      priorityWeights: weightsRes.rows[0].value,
      waitlistTtlMinutes: parseInt(ttlRes.rows[0].value)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/settings', async (req, res) => {
  const role = req.header('X-User-Role');
  const adminId = parseInt(req.header('X-User-Id'));
  if (role !== 'Admin') {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }

  const { quotas, priorityWeights, waitlistTtlMinutes } = req.body;

  try {
    if (quotas) {
      await pool.query("UPDATE settings SET value = $1 WHERE key = 'quotas'", [JSON.stringify(quotas)]);
    }
    if (priorityWeights) {
      await pool.query("UPDATE settings SET value = $1 WHERE key = 'priorityWeights'", [JSON.stringify(priorityWeights)]);
    }
    if (waitlistTtlMinutes !== undefined) {
      await pool.query("UPDATE settings SET value = $1 WHERE key = 'waitlistTtlMinutes'", [JSON.stringify(waitlistTtlMinutes)]);
    }

    // Publish to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const logMessage = JSON.stringify({
        userId: adminId,
        action: "Update Settings",
        details: "Updated system settings & quotas"
      });
      channel.publish('tinkertrack_events', 'activity.log', Buffer.from(logMessage));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing settings update log:", mqErr.message);
    }

    res.json({ message: "Settings updated successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Reservation Service] Running on port ${PORT}`);
});

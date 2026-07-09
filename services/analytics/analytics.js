import express from 'express';
import { getDb, getRabbitChannel } from '../shared/shared.js';

const app = express();
app.use(express.json());
const PORT = 5060;

const pool = getDb();

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 1. Get Analytics
app.get('/api/analytics', async (req, res) => {
  const { range, category_id } = req.query;

  try {
    // Fetch all resources and reservations
    let resQuery = "SELECT * FROM resources";
    let resParams = [];
    if (category_id && category_id !== 'All') {
      resQuery += " WHERE category_id = $1";
      resParams.push(parseInt(category_id));
    }
    const resourcesRes = await pool.query(resQuery, resParams);
    const resources = resourcesRes.rows;

    let resvQuery = "SELECT * FROM reservations WHERE status != 'Cancelled'";
    let resvParams = [];
    if (range && range !== 'all') {
      const days = parseInt(range);
      resvQuery += " AND (start_time >= NOW() - ($1 || ' days')::INTERVAL)";
      resvParams.push(days);
    }
    const reservationsRes = await pool.query(resvQuery, resvParams);
    const reservations = reservationsRes.rows.map(row => ({
      ...row,
      start_time: formatDateTime(new Date(row.start_time)),
      end_time: formatDateTime(new Date(row.end_time))
    }));

    // 1. Total bookings by resource
    const bookingsByResource = resources.map(resrc => {
      const count = reservations.filter(r => r.resource_id === resrc.id).length;
      return { name: resrc.name, count };
    });

    // 2. Resource utilization rate
    const utilization = resources.map(resrc => {
      const resvHours = reservations
        .filter(r => r.resource_id === resrc.id && ['Confirmed', 'CheckedIn', 'Completed'].includes(r.status))
        .reduce((sum, r) => {
          const hours = (new Date(r.end_time) - new Date(r.start_time)) / (1000 * 60 * 60);
          return sum + (isNaN(hours) ? 0 : hours);
        }, 0);
      const maxCap = range === '7' ? 42 : (range === '30' ? 180 : 84);
      const rate = Math.min(Math.round((resvHours / maxCap) * 100), 100);
      return { name: resrc.name, utilization: rate };
    });

    // 3. Peak hours distribution
    const hoursCount = {};
    reservations.forEach(r => {
      const hour = r.start_time.split(' ')[1]?.split(':')[0] || '10';
      hoursCount[hour] = (hoursCount[hour] || 0) + 1;
    });

    const peakHours = Object.keys(hoursCount).map(hour => ({
      hour,
      count: hoursCount[hour]
    })).sort((a, b) => a.hour.localeCompare(b.hour));

    // 4. Log activities
    const logsRes = await pool.query(
      `SELECT a.id, a.user_id, a.action, a.details, a.created_at, COALESCE(u.name, 'Unknown User') as user_name 
       FROM activity_logs a 
       LEFT JOIN users u ON a.user_id = u.id 
       ORDER BY a.id DESC LIMIT 30`
    );

    const logs = logsRes.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      details: row.details,
      created_at: formatDateTime(new Date(row.created_at)),
      user_name: row.user_name
    }));

    res.json({ bookingsByResource, utilization, peakHours, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RabbitMQ Subscriber
async function initRabbitSubscriber() {
  try {
    const channel = await getRabbitChannel();
    const q = await channel.assertQueue('analytics_queue', { durable: true });
    
    // Bind all log & registration activities
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'user.*');
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'resource.*');
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'booking.*');
    await channel.bindQueue(q.queue, 'tinkertrack_events', 'activity.log');

    channel.consume(q.queue, async (msg) => {
      if (msg !== null) {
        const routingKey = msg.fields.routingKey;
        const data = JSON.parse(msg.content.toString());

        console.log(`[Analytics Service] Logging RabbitMQ event: ${routingKey}`);

        let { userId, action, details } = data;
        
        // Map implicit actions
        if (!action) {
          if (routingKey === 'booking.created') {
            action = 'Create Reservation';
            details = `Reserved resource ID: ${data.resource_id} for ${data.start_time} - ${data.end_time}`;
          } else if (routingKey === 'booking.checkedin') {
            action = 'Check In';
            details = `Checked into reservation ID: ${data.id}`;
          } else if (routingKey === 'booking.completed') {
            action = 'Complete Reservation';
            details = `Completed reservation ID: ${data.id}`;
          } else if (routingKey === 'booking.cancelled') {
            action = 'Cancel Reservation';
            details = `Cancelled reservation ID: ${data.id}`;
          } else if (routingKey === 'booking.approved') {
            action = 'Approve Booking';
            details = `Approved booking for user ID: ${userId}`;
          } else if (routingKey === 'booking.rejected') {
            action = 'Reject Booking';
            details = `Rejected booking for user ID: ${userId}`;
          } else if (routingKey === 'resource.created') {
            action = 'Create Resource';
            details = data.details;
          } else if (routingKey === 'resource.updated') {
            action = 'Update Resource';
            details = data.details;
          } else if (routingKey === 'resource.deleted') {
            action = 'Delete Resource';
            details = data.details;
          } else if (routingKey === 'user.loggedin') {
            action = 'Login';
            details = data.details;
          } else if (routingKey === 'user.registered') {
            action = 'Register';
            details = data.details;
          }
        }

        if (userId && action) {
          await pool.query(
            "INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)",
            [userId, action, details || '']
          );
        }

        channel.ack(msg);
      }
    });
    console.log("[Analytics Service] Subscribed to RabbitMQ analytics topic binds");
  } catch (err) {
    console.error("[Analytics Service] RabbitMQ Subscription failed:", err.message);
    setTimeout(initRabbitSubscriber, 5000);
  }
}

app.listen(PORT, () => {
  console.log(`[Analytics Service] Running on port ${PORT}`);
  setTimeout(initRabbitSubscriber, 6000);
});

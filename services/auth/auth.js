import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb, getRabbitChannel } from '../shared/shared.js';

const app = express();
app.use(express.json());
const PORT = 5010;
const JWT_SECRET = 'tinkertrack_secret_key_1337';

const pool = getDb();

// Helper: Hashing password
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// 1. Register User
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields (name, email, password)." });
  }

  try {
    // Check if user exists
    const checkUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists with this email." });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const pwdHash = hashPassword(password, salt);

    const roleName = role || 'Undergraduate';
    const roleRes = await pool.query("SELECT id FROM roles WHERE name = $1", [roleName]);
    if (roleRes.rows.length === 0) {
      return res.status(400).json({ error: "Invalid role specified." });
    }
    const roleId = roleRes.rows[0].id;

    // Insert user
    const insertRes = await pool.query(
      `INSERT INTO users (role_id, name, email, password_hash, salt) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [roleId, name, email, pwdHash, salt]
    );

    const userId = insertRes.rows[0].id;

    // Fetch user details with role
    const userRes = await pool.query(
      `SELECT u.id, u.name, u.email, r.name as role_name, r.permissions 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [userId]
    );
    const user = userRes.rows[0];

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role_name, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Publish to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const message = JSON.stringify({ userId: user.id, email: user.email, action: 'Register', details: `User registered: ${email}` });
      channel.publish('tinkertrack_events', 'user.registered', Buffer.from(message));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing user registration event:", mqErr.message);
    }

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role_name }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Login User
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email and password." });
  }

  try {
    const userRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.salt, r.name as role_name, r.permissions 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.email = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = userRes.rows[0];
    const computedHash = hashPassword(password, user.salt);

    if (computedHash !== user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role_name, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Publish to RabbitMQ
    try {
      const channel = await getRabbitChannel();
      const message = JSON.stringify({ userId: user.id, email: user.email, action: 'Login', details: `User logged in: ${email}` });
      channel.publish('tinkertrack_events', 'user.loggedin', Buffer.from(message));
    } catch (mqErr) {
      console.error("[RabbitMQ] Error publishing user login event:", mqErr.message);
    }

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role_name }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Me
app.get('/api/auth/me', (req, res) => {
  // Read headers set by Gateway
  const id = req.header('X-User-Id');
  const role = req.header('X-User-Role');
  const email = req.header('X-User-Email');
  const name = req.header('X-User-Name');

  if (!id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({ id: parseInt(id), role, email, name });
});

// 4. Users list for Dev switch UI
app.get('/api/users', async (req, res) => {
  try {
    const usersRes = await pool.query(
      `SELECT u.id, u.role_id, u.name, u.email, r.name as role_name, r.permissions 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       ORDER BY u.id ASC`
    );
    // Format to match old db schema exports
    const formatted = usersRes.rows.map(row => ({
      id: row.id,
      role_id: row.role_id,
      name: row.name,
      email: row.email,
      role_name: row.role_name,
      permissions: JSON.stringify(row.permissions)
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Auth Service] Running on port ${PORT}`);
});

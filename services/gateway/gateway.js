import express from 'express';
import cors from 'cors';
import proxy from 'express-http-proxy';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 5005;
const JWT_SECRET = 'tinkertrack_secret_key_1337';

app.use(cors());
app.use(express.json());

const publicRoutes = [
  { path: '/auth/login', method: 'POST' },
  { path: '/auth/register', method: 'POST' },
  { path: '/resources', method: 'GET' },
  { path: '/users', method: 'GET' }
];

function isPublicRoute(req) {
  return publicRoutes.some(r => r.path === req.path && r.method === req.method);
}

function authenticateJWT(req, res, next) {
  if (isPublicRoute(req)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
      if (err) {
        return res.status(403).json({ error: "Access Denied: Invalid or expired token." });
      }
      req.user = decodedUser;
      next();
    });
  } else {
    res.status(401).json({ error: "Access Denied: Authentication token missing." });
  }
}

app.use('/api', authenticateJWT);

const SERVICES = {
  auth: 'http://localhost:5010',
  catalog: 'http://localhost:5020',
  reservation: 'http://localhost:5030',
  waitlist: 'http://localhost:5040',
  notifications: 'http://localhost:5050',
  analytics: 'http://localhost:5060'
};

const proxyOptions = {
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    if (srcReq.user) {
      proxyReqOpts.headers['X-User-Id'] = srcReq.user.id;
      proxyReqOpts.headers['X-User-Role'] = srcReq.user.role;
      proxyReqOpts.headers['X-User-Email'] = srcReq.user.email;
      proxyReqOpts.headers['X-User-Name'] = srcReq.user.name;
    }
    return proxyReqOpts;
  }
};

app.use('/api/auth', proxy(SERVICES.auth, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/auth' + req.url
}));

app.use('/api/users', proxy(SERVICES.auth, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/users' + req.url
}));

app.use('/api/resources', proxy(SERVICES.catalog, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/resources' + req.url
}));

app.use('/api/reservations', proxy(SERVICES.reservation, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/reservations' + req.url
}));

app.use('/api/waitlists', proxy(SERVICES.waitlist, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/waitlists' + req.url
}));

app.use('/api/notifications', proxy(SERVICES.notifications, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/notifications' + req.url
}));

app.use('/api/analytics', proxy(SERVICES.analytics, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/analytics' + req.url
}));

// Route admin/settings and admin/reservations to reservation service
app.use('/api/admin', proxy(SERVICES.reservation, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/admin' + req.url
}));

app.use('/api/test', proxy(SERVICES.waitlist, {
  ...proxyOptions,
  proxyReqPathResolver: req => '/api/test' + req.url
}));

app.listen(PORT, () => {
  console.log(`[API Gateway] Running on port ${PORT}`);
});

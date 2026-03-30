export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  auth0: {
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    audience: process.env.AUTH0_AUDIENCE,
  },
  cookie: {
    secret: process.env.COOKIE_SECRET || 'change-me-in-production',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

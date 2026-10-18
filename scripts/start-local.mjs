// Runs the production build on http://localhost:4000 with your server/.env, exactly like the
// deployed app (service worker, install, notifications, security headers) but on this
// computer. Browsers treat localhost as secure, so notifications work here.
// Usage: npm run app:local
process.env.APP_ORIGIN = 'http://localhost:4000';
process.env.PORT = '4000';
await import('../server/src/server.js');

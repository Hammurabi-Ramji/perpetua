const { startServer } = require('./app');

startServer().catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

import Redis from 'ioredis';

const redis = new Redis({
  host: '127.0.0.1', // localhost
  port: 6379, // default Redis port
  retryStrategy: (times) => Math.min(times * 50, 2000), // retry connection if it fails
});

// Event listener for successful connection
redis.on('connect', () => {
  console.log('Redis connection established successfully.');
});

// Event listener for when the connection is ready to use
redis.on('ready', () => {
  console.log('Redis is ready to use.');
});

// Event listener for connection errors
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Event listener for reconnection attempts
redis.on('reconnecting', (times) => {
  console.log(`Redis reconnecting attempt #${times}`);
});

export default redis;

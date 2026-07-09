import pg from 'pg';
import { createClient } from 'redis';
import amqp from 'amqplib';

// DB config
const pgConfig = {
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5433,
  database: process.env.PGDATABASE || 'tinkertrack',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'password123',
};

const pgPool = new pg.Pool(pgConfig);

// Redis config
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redisClient = null;

export async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

// RabbitMQ config
const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
let rabbitConn = null;
let rabbitChannel = null;

export async function getRabbitChannel() {
  if (!rabbitChannel) {
    rabbitConn = await amqp.connect(rabbitUrl);
    rabbitChannel = await rabbitConn.createChannel();
    // Assert exchange
    await rabbitChannel.assertExchange('tinkertrack_events', 'topic', { durable: true });
  }
  return rabbitChannel;
}

export function getDb() {
  return pgPool;
}

export async function closeConnections() {
  await pgPool.end();
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (rabbitConn) {
    await rabbitConn.close();
    rabbitConn = null;
    rabbitChannel = null;
  }
}

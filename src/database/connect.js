import mongoose from 'mongoose';

import {
  env,
} from '../config/env.js';

import {
  logger,
} from '../utils/logger.js';

export async function connectDatabase() {
  mongoose.set(
    'strictQuery',
    true,
  );

  await mongoose.connect(
    env.MONGO_URI,
    {
      dbName: 'lcso',
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
    },
  );

  logger.info(
    'MongoDB connected',
    {
      database:
        mongoose.connection.name,
    },
  );
}

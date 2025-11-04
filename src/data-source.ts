// src/data-source.ts

import { config } from 'dotenv';
config(); // Load environment variables from .env

import { DataSource } from 'typeorm';
import path from 'path';

// Import your entities here
import { FileStore } from './filestore/entities/filestore.entity';
// Import other entities as needed

// Resolve paths for entities and migrations
const entitiesPath = path.resolve(__dirname, '**', '*.entity.{ts,js}');
const migrationsPath = path.resolve(__dirname, 'migrations', '*.ts');

console.log('Entities Path:', entitiesPath);
console.log('Migrations Path:', migrationsPath);

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'bongopay_test',

  // Glob pattern to include all .entity.ts and .entity.js files
  entities: [entitiesPath],

  // Specify the migrations directory
  migrations: [migrationsPath],

  synchronize: false, // Must be false when using migrations
  logging: false,
  ssl: true, // Adjust based on your environment

  // Optional: Specify the migrations directory for CLI operations
  // CLI configuration for migrations
});

export default AppDataSource;

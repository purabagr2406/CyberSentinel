import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';

const app = express();

const PORT = process.env.PORT || 5000;
const DB_URI=process.env.MONGO_URI;
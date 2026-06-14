import express from 'express';
import cors from 'cors';
import { handleModels, handleChatCompletion } from './provider/puter';

const app = express();

// Basic request logging (before body parsing)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

app.use(cors());
app.use(express.json());

// Body logging middleware (after JSON parsing)
app.use((req, res, next) => {
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Optional API‑key authorization middleware (accept any bearer token)
app.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    // Store the key on the request object for later use (if needed)
    (req as any).apiKey = auth.substring('Bearer '.length);
  }
  // No validation – any key is accepted; absence is also allowed
  next();
});

/**
 * OpenAI‑compatible Models List endpoint.
 */
app.get('/v1/models', handleModels);

/**
 * OpenAI‑compatible Chat Completion endpoint.
 */
app.post('/v1/chat/completions', handleChatCompletion);

export { app };

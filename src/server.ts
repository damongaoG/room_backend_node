import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import userProfileRouter from './routes/userProfile.js';

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(userProfileRouter);

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

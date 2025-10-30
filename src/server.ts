import "dotenv/config";
import express from "express";
import cors from "cors";
import { createRequire } from "module";
import userProfileRouter from "./routes/userProfile.js";

const require = createRequire(import.meta.url);
const helmet = require("helmet");

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(userProfileRouter);

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

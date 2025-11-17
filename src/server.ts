import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { createRequire } from "module";
import userProfileRouter from "./routes/userProfile.js";
import searchPreferencesRouter from "./routes/searchPreferences.js";
import propertyImagesRouter from "./routes/propertyImages.js";

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
app.use(searchPreferencesRouter);
app.use(propertyImagesRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error in request pipeline", err);

  if (err instanceof Error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: err.message,
    });
  }

  return res.status(500).json({
    error: "Internal Server Error",
  });
});

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

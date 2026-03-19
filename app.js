import express from "express";
import "./config/env.js"; // ensure .env is loaded
import { connectDB } from "./config/db.js";
import adminRouter from "./router/admin.router.js";
import userRouter from "./router/user.router.js";
import authRouter from "./router/auth.router.js";

const app = express();
const port = Number(process.env.PORT) || 5000;

// CORS (without external dependency)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://purefire-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
  } else if (req.method === "OPTIONS") {
    // Block disallowed origins early
    return res.sendStatus(403);
  }
  next();
});

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: true, message: "Backend is running" });
});

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("Failed to connect to MongoDB. Exiting.");
    process.exit(1);
  }

  app.use("/admin", adminRouter);
  app.use("/user", userRouter);
  app.use("/api/auth", authRouter);
  console.log("Admin routes loaded at /admin");
  console.log("User routes loaded at /user");
  console.log("Auth routes loaded at /api/auth");

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
};

startServer();

export default app;

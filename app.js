import express from "express";
import "./config/env.js"; // ensure .env is loaded
import { connectDB } from "./config/db.js";

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

  try {
    const { default: adminRouter } = await import("./router/admin.router.js");
    app.use("/admin", adminRouter);
    console.log("Admin routes loaded at /admin");
  } catch (error) {
    console.warn("Admin routes not loaded:", error.message);
  }

  try {
    const { default: userRouter } = await import("./router/user.router.js");
    app.use("/user", userRouter);
    console.log("User routes loaded at /user");
  } catch (error) {
    console.warn("User routes not loaded:", error.message);
  }

  try {
    const { default: authRouter } = await import("./router/auth.router.js");
    app.use("/api/auth", authRouter);
    console.log("Auth routes loaded at /api/auth");
  } catch (error) {
    console.warn("Auth routes not loaded:", error.message);
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
};

startServer();

export default app;

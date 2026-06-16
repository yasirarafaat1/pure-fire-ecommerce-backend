import mongoose from "mongoose";
import { loadEnv } from "./env.js";

loadEnv();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "ecommerce";

export const connectDB = async () => {
  if (!uri) {
    throw new Error("MONGO_URI not set in environment");
  }
  try {
    await mongoose.connect(uri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ MongoDB connected");

    // Drop legacy unique index on name if it exists (allows same name under different parents)
    try {
      const collection = mongoose.connection.collection("catagories");
      const indexes = await collection.indexes();
      const legacy = indexes.find((idx) => idx.name === "name_1");
      if (legacy && legacy.unique) {
        await collection.dropIndex("name_1");
        console.log("Dropped legacy unique index on catagories.name");
      }
    } catch (err) {
      // ignore if collection or index doesn't exist
    }
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
};

export default mongoose;

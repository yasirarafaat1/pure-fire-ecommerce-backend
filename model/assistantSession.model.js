import mongoose from "mongoose";

const AssistantSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Assistant chat", index: true },
    userId: { type: String, default: null, index: true },
    guestId: { type: String, default: null, index: true },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    source: { type: String, enum: ["web"], default: "web" },
    userAgent: { type: String, default: null },
    ipHash: { type: String, default: null },
    lastIntent: { type: String, default: null },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const AssistantSession = mongoose.model("AssistantSession", AssistantSessionSchema);
export default AssistantSession;

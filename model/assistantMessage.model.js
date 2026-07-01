import mongoose from "mongoose";

const AssistantMessageSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    role: {
      type: String,
      enum: ["user", "assistant", "system", "tool"],
      required: true,
    },
    content: { type: String, required: true, default: "" },
    intent: { type: String, default: null },
    cards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    suggestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    toolCalls: { type: [mongoose.Schema.Types.Mixed], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AssistantMessageSchema.index({ sessionId: 1, createdAt: -1 });

const AssistantMessage = mongoose.model("AssistantMessage", AssistantMessageSchema);
export default AssistantMessage;

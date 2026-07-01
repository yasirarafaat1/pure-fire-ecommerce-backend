import mongoose from "mongoose";

const AssistantFeedbackSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    rating: { type: String, enum: ["up", "down"], required: true },
    comment: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AssistantFeedback = mongoose.model("AssistantFeedback", AssistantFeedbackSchema);
export default AssistantFeedback;

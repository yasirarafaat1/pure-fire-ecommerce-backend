import mongoose from "mongoose";

const AssistantSupportTicketSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    issueType: { type: String, required: true, default: "general" },
    message: { type: String, required: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
  },
  { timestamps: true }
);

const AssistantSupportTicket = mongoose.model(
  "AssistantSupportTicket",
  AssistantSupportTicketSchema
);
export default AssistantSupportTicket;

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
    consentAt: v.number(),
    source: v.optional(v.string()),
    referrer: v.optional(v.string()),
    userAgentFamily: v.optional(v.string()),
  }).index("by_email", ["email"]),
});

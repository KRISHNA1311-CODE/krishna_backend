import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // Standardize emails
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default in queries
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    displayName: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.post("save", async function (doc, next) {
  try {
    await doc.constructor
      .model("AppStat")
      .findOneAndUpdate(
        { key: "main" },
        { $inc: { totalCustomers: 1 } },
        { upsert: true },
      );
    next();
  } catch (err) {
    console.error("Sync Error: Failed to increment AppStat", err);
    next(err);
  }
});

export const User = mongoose.model("User", userSchema);

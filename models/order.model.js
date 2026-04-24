import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    customer: { type: String },
    customerEmail: String,
    customerPhone: String,
    shippingAddress: String,
    city: String,
    pincode: String,
    date: String,
    total: Number,
    status: String,
    paymentStatus: String,
    paymentMethod: String,
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
  },
  {
    timestamps: true,
  },
);

export const Order = mongoose.model("Order", orderSchema);

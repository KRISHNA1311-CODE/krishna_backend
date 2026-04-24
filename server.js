import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "crypto";
import axios from "axios";

import { User } from "./models/user.model.js";
import { Order } from "./models/order.model.js";
import { AppStat } from "./models/appStat.model.js";
import { Product } from "./models/product.model.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- CONFIG & VALIDATION ---
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";
const RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID || "rzp_test_Scs20M8ztG7ipd";
const RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "V06vDOvRKmlaEVFoGbsNfvdR";

if (!MONGODB_URI)
  console.warn("⚠️ MONGODB_URI missing. Database will not function.");

// --- MIDDLEWARE ---
app.use(helmet()); // Basic security headers
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

// Helper for cleaner async routes
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    if (MONGODB_URI) {
      await mongoose.connect(MONGODB_URI);
      console.log("✅ MongoDB Connected");
    }
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
};
connectDB();

// --- RAZORPAY SERVICE ---
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// --- AUTH ROUTES ---

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const { email, password, role, displayName } = req.body;

    if (!email || !password || !role || !displayName)
      return res.status(400).json({ error: "Missing fields" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      displayName,
    });

    res.status(201).json({ message: "Registration successful" });
  }),
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password");

    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    });
  }),
);

// --- PAYMENT ROUTES ---
app.post("/api/razorpay/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR" } = req.body;

    const options = {
      amount: Math.round(Number(amount) * 100), // Amount in paise
      currency,
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Return order details + Public Key for frontend
    res.status(200).json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

// 2. Verify Payment
app.post("/api/razorpay/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  // Generate signature using our Secret Key
  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generated_signature === razorpay_signature) {
    // Optional: Update Order status in MongoDB here
    // await Order.findOneAndUpdate({ razorpayOrderId: razorpay_order_id }, { status: 'Paid' });

    res
      .status(200)
      .json({ status: "ok", message: "Payment verified successfully" });
  } else {
    res
      .status(400)
      .json({ status: "error", message: "Invalid payment signature" });
  }
});

// --- ORDER ROUTES ---

app.get(
  "/api/orders",
  asyncHandler(async (req, res) => {
    const { email } = req.query;
    const filter = email ? { customerEmail: email } : {};
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate("productId");
    res.json(orders);
  }),
);

app.post(
  "/api/orders",
  asyncHandler(async (req, res) => {
    console.log(req.body);
    const newOrder = await Order.create({ ...req.body, status: "Pending" });
    res.status(201).json(newOrder);
  }),
);

// --- NOTIFICATIONS ---

app.post(
  "/api/notifications/telegram",
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat_id } =
      process.env;

    if (!token || !chat_id) {
      console.log("Telegram Log:", message);
      return res.json({ status: "mock_sent" });
    }

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id,
      text: message,
      parse_mode: "HTML",
    });

    res.json({ status: "ok" });
  }),
);

app.get("/api/dashboard", async (req, res) => {
  console.log("Dashboard hit");
  const stat = await AppStat.findOne({ key: "main" });
  res.status(200).json(stat);
});

app.get("/api/products", async (req, res) => {
  const products = await Product.find();
  res.status(200).json(products);
});

app.post("/api/products", async (req, res) => {
  const products = await Product.create(req.body);
  res.status(200).json(products);
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
});

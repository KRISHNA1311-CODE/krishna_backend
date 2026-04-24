import mongoose from "mongoose"

const appStatSchema = new mongoose.Schema({
    key: {
        type: String,
        default: "main",
        unique: true
    },
    totalRevenue: {
        type: Number,
        default: 0
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    totalCustomers: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

export const AppStat = mongoose.model('AppStat', appStatSchema);
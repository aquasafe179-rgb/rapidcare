// models/BloodBank.js
const mongoose = require('mongoose');

const BloodBankSchema = new mongoose.Schema(
    {
        bloodBankId: { type: String, required: true, unique: true },
        hospitalId: { type: String, required: true, index: true },
        bloodType: {
            type: String,
            enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
            required: true
        },
        quantity: { type: Number, required: true, default: 0 }, // in units
        expiryDate: { type: Date, required: true },
        status: {
            type: String,
            enum: ['Available', 'Used', 'Expired'],
            default: 'Available'
        },
        donorInfo: {
            donorId: { type: String },
            donorName: { type: String },
            donationDate: { type: Date }
        },
        usedFor: {
            emergencyId: { type: String },
            patientName: { type: String },
            usedAt: { type: Date },
            usedBy: { type: String }
        },
        addedBy: { type: String },
        notes: { type: String }
    },
    { timestamps: true }
);

// Index for efficient queries
BloodBankSchema.index({ hospitalId: 1, bloodType: 1, status: 1 });

module.exports = mongoose.model('BloodBank', BloodBankSchema);

// models/Leave.js
const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema(
    {
        leaveId: { type: String, required: true, unique: true },
        doctorId: { type: String, required: true, index: true },
        hospitalId: { type: String, required: true, index: true },
        doctorName: { type: String },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        leaveType: {
            type: String,
            enum: ['Sick', 'Casual', 'Emergency', 'Vacation'],
            required: true
        },
        reason: { type: String, required: true },
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected'],
            default: 'Pending'
        },
        approvedBy: { type: String },
        approvedAt: { type: Date },
        rejectionReason: { type: String },
        remarks: { type: String }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Leave', LeaveSchema);

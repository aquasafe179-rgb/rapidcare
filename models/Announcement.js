// models/Announcement.js
const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema(
    {
        announcementId: { type: String, required: true, unique: true },
        hospitalId: { type: String, required: true, index: true },
        title: { type: String, required: true },
        content: { type: String, required: true, maxlength: 500 },
        type: {
            type: String,
            enum: ['Capacity', 'Blood', 'Doctor', 'Service', 'Emergency', 'General'],
            default: 'General'
        },
        priority: {
            type: String,
            enum: ['Low', 'Medium', 'High', 'Critical'],
            default: 'Medium'
        },
        createdBy: { type: String, required: true },
        expiresAt: { type: Date, required: true }, // Auto-delete after 24 hours
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

// TTL index to auto-delete expired announcements
AnnouncementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);

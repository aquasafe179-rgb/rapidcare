// models/Attendance.js
const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    doctorId: { type: String, required: true, index: true },
    hospitalId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    availability: { type: String, enum: ['Present', 'Absent'], required: true },
    shift: { type: String, enum: ['Morning', 'Afternoon', 'Evening', 'Night'], default: 'Morning' },
    markedBy: { type: String, enum: ['Doctor', 'Reception'], required: true },
    method: { type: String, enum: ['Manual', 'QR', 'GPS'], required: false },

    // GPS Check-in
    checkInTime: { type: Date },
    checkInLocation: {
      lat: { type: Number },
      lng: { type: Number }
    },
    checkInVerified: { type: Boolean, default: false },
    checkInDistance: { type: Number }, // Distance from hospital in meters

    // GPS Check-out
    checkOutTime: { type: Date },
    checkOutLocation: {
      lat: { type: Number },
      lng: { type: Number }
    },
    checkOutVerified: { type: Boolean, default: false },
    checkOutDistance: { type: Number },

    // Hours worked
    hoursWorked: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AttendanceSchema.index({ doctorId: 1, date: 1 }, { unique: true });
module.exports = mongoose.model('Attendance', AttendanceSchema);



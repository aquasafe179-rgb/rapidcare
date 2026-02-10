// models/Ambulance.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const AmbulanceSchema = new mongoose.Schema(
  {
    ambulanceId: { type: String, required: true, unique: true },
    hospitalId: { type: String, required: true, index: true },
    vehicleNumber: { type: String, required: true },
    vehicleType: { type: String, enum: ['BLS', 'ALS', 'ICU'], default: 'BLS' },

    // EMT Reference (can be populated)
    emtId: { type: String, ref: 'EMT' },
    emt: {
      emtId: { type: String },
      name: { type: String },
      mobile: { type: String }
    },

    // Driver Reference (can be populated)
    driverId: { type: String, ref: 'Driver' },
    pilot: {
      pilotId: { type: String },
      name: { type: String },
      mobile: { type: String }
    },

    status: {
      type: String,
      enum: ['Available', 'On Duty', 'En Route', 'At Scene', 'Transporting', 'Offline'],
      default: 'Available'
    },

    // Real-time location tracking
    location: {
      lat: { type: Number },
      lng: { type: Number }
    },
    lastLocationUpdate: { type: Date },

    // Current assignment
    currentEmergencyId: { type: String },

    equipment: [{ type: String }],
    lastLogin: { type: Date },
    password: { type: String, default: 'test@1234' },
    forcePasswordChange: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Hash password before saving
AmbulanceSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    if (this.password.startsWith('$2b$')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
AmbulanceSchema.methods.comparePassword = async function (candidate) {
  try {
    return await bcrypt.compare(candidate, this.password);
  } catch (err) {
    return candidate === this.password;
  }
};



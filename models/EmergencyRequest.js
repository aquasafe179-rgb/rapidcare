// models/EmergencyRequest.js
const mongoose = require('mongoose');

const EmergencyRequestSchema = new mongoose.Schema(
  {
    emergencyId: { type: String, required: true, unique: true },
    hospitalId: { type: String, required: true, index: true },
    patient: {
      name: { type: String, required: true },
      age: { type: Number },
      gender: { type: String },
      mobile: { type: String },
      address: { type: String },
      location: {
        lat: { type: Number },
        lng: { type: Number }
      }
    },
    emergencyType: { type: String, required: true },
    severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    description: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Dispatched', 'En Route', 'At Scene', 'Transporting', 'Arrived', 'Completed', 'Rejected'],
      default: 'Pending'
    },

    // Ambulance assignment
    assignedAmbulanceId: { type: String },

    // ETA tracking
    eta: {
      toPatient: { type: Number }, // minutes
      toHospital: { type: Number }, // minutes
      totalETA: { type: Number }, // minutes
      lastUpdated: { type: Date }
    },

    // Timeline tracking
    timeline: [{
      status: { type: String },
      timestamp: { type: Date },
      notes: { type: String }
    }],

    // Dispatch metadata
    dispatchedAt: { type: Date },
    arrivedAtPatientAt: { type: Date },
    departedFromPatientAt: { type: Date },
    arrivedAtHospitalAt: { type: Date },
    completedAt: { type: Date },

    rejectionReason: { type: String },
    alternateHospitals: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmergencyRequest', EmergencyRequestSchema);

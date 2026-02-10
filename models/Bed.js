// models/Bed.js
const mongoose = require('mongoose');

const BedSchema = new mongoose.Schema(
  {
    hospitalId: { type: String, required: true, index: true },
    bedId: { type: String, required: true, unique: true },
    bedNumber: { type: String, required: true },
    wardNumber: { type: String, default: '' },
    bedType: { type: String, enum: ['ICU', 'General', 'Other'], default: 'General' },
    status: { type: String, enum: ['Vacant', 'Occupied', 'Reserved', 'Cleaning'], default: 'Vacant' },
    qrCodeUrl: { type: String, default: '' },
    qrVacantUrl: { type: String, default: '' },
    qrOccupiedUrl: { type: String, default: '' },
    lastUpdated: { type: Date },

    // Patient occupation details
    occupiedBy: { type: String, default: '' }, // Patient name
    occupiedAt: { type: Date },

    // Discharge workflow
    discharge: {
      dischargedAt: { type: Date },
      dischargedBy: { type: String },
      reason: { type: String },
      notes: { type: String }
    },

    // Cleaning workflow
    cleaning: {
      startedAt: { type: Date },
      startedBy: { type: String },
      completedAt: { type: Date },
      completedBy: { type: String },
      expectedDuration: { type: Number, default: 30 } // minutes
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bed', BedSchema);



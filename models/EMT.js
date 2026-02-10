// models/EMT.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const EMTSchema = new mongoose.Schema(
    {
        emtId: { type: String, required: true, unique: true },
        hospitalId: { type: String, required: true, index: true },
        ambulanceId: { type: String, index: true },
        name: { type: String, required: true },
        qualification: {
            type: String,
            enum: ['Basic EMT', 'Advanced EMT', 'Paramedic'],
            required: true
        },
        mobile: { type: String, required: true },
        licenseNumber: { type: String, required: true },
        licenseExpiryDate: { type: Date },
        password: { type: String, default: 'test@1234' },
        forcePasswordChange: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true },
        photoUrl: { type: String }
    },
    { timestamps: true }
);

// Hash password before saving
EMTSchema.pre('save', async function (next) {
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
EMTSchema.methods.comparePassword = async function (candidate) {
    try {
        return await bcrypt.compare(candidate, this.password);
    } catch (err) {
        return candidate === this.password;
    }
};

module.exports = mongoose.model('EMT', EMTSchema);

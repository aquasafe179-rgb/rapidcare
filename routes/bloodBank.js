// routes/bloodBank.js
const express = require('express');
const router = express.Router();
const BloodBank = require('../models/BloodBank');
const { auth } = require('../middleware/auth');

module.exports = (io) => {
    // Get blood stock summary for a hospital
    router.get('/:hospitalId', async (req, res) => {
        try {
            const { hospitalId } = req.params;

            // Get all available blood units
            const bloodUnits = await BloodBank.find({
                hospitalId,
                status: 'Available',
                expiryDate: { $gt: new Date() } // Not expired
            });

            // Group by blood type and sum quantities
            const summary = {};
            const bloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

            bloodTypes.forEach(type => {
                const units = bloodUnits.filter(b => b.bloodType === type);
                const total = units.reduce((sum, b) => sum + b.quantity, 0);
                summary[type] = total;
            });

            res.json({ success: true, summary, totalUnits: bloodUnits.length });

        } catch (err) {
            console.error('Get blood stock error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Add blood units
    router.post('/', auth(['hospital']), async (req, res) => {
        try {
            const { hospitalId, bloodType, quantity, expiryDate, donorInfo, notes } = req.body;

            // Verify hospital
            if (req.user.role === 'hospital' && req.user.ref !== hospitalId) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            // Validate blood type
            const validTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
            if (!validTypes.includes(bloodType)) {
                return res.status(400).json({ success: false, message: 'Invalid blood type' });
            }

            // Generate blood bank ID
            const bloodBankId = `BLOOD-${hospitalId}-${bloodType}-${Date.now()}`;

            const blood = new BloodBank({
                bloodBankId,
                hospitalId,
                bloodType,
                quantity: parseInt(quantity),
                expiryDate: new Date(expiryDate),
                status: 'Available',
                donorInfo,
                addedBy: req.user.ref,
                notes
            });

            await blood.save();

            // Check if low stock after adding
            const allBlood = await BloodBank.find({
                hospitalId,
                bloodType,
                status: 'Available',
                expiryDate: { $gt: new Date() }
            });
            const totalUnits = allBlood.reduce((sum, b) => sum + b.quantity, 0);

            // Emit socket event
            io.to(`hospital_${hospitalId}`).emit('blood:added', {
                bloodType,
                quantity,
                totalUnits,
                lowStock: totalUnits < 5
            });

            // Emit low stock alert if needed
            if (totalUnits < 5) {
                io.to(`hospital_${hospitalId}`).emit('blood:low-stock', {
                    bloodType,
                    totalUnits,
                    critical: totalUnits < 2
                });
            }

            res.json({
                success: true,
                blood,
                totalUnits,
                message: `Added ${quantity} units of ${bloodType}. Total: ${totalUnits} units`
            });

        } catch (err) {
            console.error('Add blood error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Use blood units
    router.put('/:bloodId/use', auth(['hospital']), async (req, res) => {
        try {
            const { bloodId } = req.params;
            const { emergencyId, patientName, unitsUsed } = req.body;

            const blood = await BloodBank.findOne({ bloodBankId: bloodId });
            if (!blood) {
                return res.status(404).json({ success: false, message: 'Blood unit not found' });
            }

            // Verify hospital
            if (req.user.role === 'hospital' && req.user.ref !== blood.hospitalId) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (blood.status !== 'Available') {
                return res.status(400).json({ success: false, message: 'Blood unit not available' });
            }

            const usedUnits = parseInt(unitsUsed) || blood.quantity;

            if (usedUnits > blood.quantity) {
                return res.status(400).json({ success: false, message: 'Not enough units available' });
            }

            // Update blood record
            if (usedUnits === blood.quantity) {
                blood.status = 'Used';
                blood.quantity = 0;
            } else {
                blood.quantity -= usedUnits;
            }

            blood.usedFor = {
                emergencyId,
                patientName,
                usedAt: new Date(),
                usedBy: req.user.ref
            };

            await blood.save();

            // Get remaining units
            const remaining = await BloodBank.find({
                hospitalId: blood.hospitalId,
                bloodType: blood.bloodType,
                status: 'Available',
                expiryDate: { $gt: new Date() }
            });
            const totalRemaining = remaining.reduce((sum, b) => sum + b.quantity, 0);

            // Emit socket event
            io.to(`hospital_${blood.hospitalId}`).emit('blood:used', {
                bloodType: blood.bloodType,
                unitsUsed,
                remainingUnits: totalRemaining,
                emergencyId,
                patientName
            });

            // Emit low stock alert if needed
            if (totalRemaining < 5) {
                io.to(`hospital_${blood.hospitalId}`).emit('blood:low-stock', {
                    bloodType: blood.bloodType,
                    totalUnits: totalRemaining,
                    critical: totalRemaining < 2
                });
            }

            res.json({
                success: true,
                blood,
                remainingUnits: totalRemaining,
                message: `Used ${usedUnits} units of ${blood.bloodType}. Remaining: ${totalRemaining} units`
            });

        } catch (err) {
            console.error('Use blood error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Get low stock alerts
    router.get('/alerts/:hospitalId', async (req, res) => {
        try {
            const { hospitalId } = req.params;

            const bloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
            const alerts = [];

            for (const type of bloodTypes) {
                const units = await BloodBank.find({
                    hospitalId,
                    bloodType: type,
                    status: 'Available',
                    expiryDate: { $gt: new Date() }
                });
                const total = units.reduce((sum, b) => sum + b.quantity, 0);

                if (total < 5) {
                    alerts.push({
                        bloodType: type,
                        totalUnits: total,
                        level: total < 2 ? 'critical' : 'low'
                    });
                }
            }

            res.json({ success: true, alerts });

        } catch (err) {
            console.error('Get alerts error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Get expiry warnings (blood expiring in next 30 days)
    router.get('/expiry/:hospitalId', async (req, res) => {
        try {
            const { hospitalId } = req.params;

            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

            const expiringBlood = await BloodBank.find({
                hospitalId,
                status: 'Available',
                expiryDate: {
                    $gt: new Date(),
                    $lt: thirtyDaysFromNow
                }
            }).sort({ expiryDate: 1 });

            res.json({ success: true, expiringBlood });

        } catch (err) {
            console.error('Get expiry warnings error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Get usage history
    router.get('/history/:hospitalId', async (req, res) => {
        try {
            const { hospitalId } = req.params;
            const limit = parseInt(req.query.limit) || 20;

            const history = await BloodBank.find({
                hospitalId,
                status: 'Used'
            })
                .sort({ 'usedFor.usedAt': -1 })
                .limit(limit);

            res.json({ success: true, history });

        } catch (err) {
            console.error('Get history error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    return router;
};

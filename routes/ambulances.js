// routes/ambulances.js
const express = require('express');
const router = express.Router();
const Ambulance = require('../models/Ambulance');
const { auth } = require('../middleware/auth');

module.exports = (io) => {
  router.get('/:hospitalId', async (req, res) => {
    if (req.user && req.user.role === 'hospital' && req.user.ref !== req.params.hospitalId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    // Optimized with .lean() for faster performance
    const list = await Ambulance.find({ hospitalId: req.params.hospitalId }).lean();
    res.json(list);
  });

  // get ambulance by id or by emt/pilot id (query username=)
  router.get('/', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: 'username required' });
    // Optimized with .lean()
    const amb = await Ambulance.findOne({
      $or: [
        { ambulanceId: username },
        { 'emt.emtId': username },
        { 'pilot.pilotId': username }
      ]
    }).lean();
    if (!amb) return res.status(404).json({ message: 'not found' });
    res.json(amb);
  });

  router.post('/', auth(['hospital']), async (req, res) => {
    try {
      console.log('Ambulance POST - User:', req.user, 'Body hospitalId:', req.body.hospitalId);
      if (req.user.role === 'hospital' && req.user.ref !== req.body.hospitalId) {
        console.log('Forbidden: user.ref', req.user.ref, '!== body.hospitalId', req.body.hospitalId);
        return res.status(403).json({ success: false, message: `Forbidden: Your hospital ID (${req.user.ref}) does not match the request (${req.body.hospitalId})` });
      }

      // Validate required fields
      if (!req.body.ambulanceId || !req.body.hospitalId || !req.body.ambulanceNumber) {
        return res.status(400).json({ success: false, message: 'Ambulance ID, Hospital ID, and Ambulance Number are required' });
      }

      // Check if ambulance already exists
      const existing = await Ambulance.findOne({ ambulanceId: req.body.ambulanceId });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Ambulance ID already exists' });
      }

      const amb = new Ambulance({ ...req.body, password: 'test@1234', forcePasswordChange: true, status: 'Offline' });
      await amb.save();
      res.json({ success: true, ambulance: amb });
    } catch (err) {
      console.error('Ambulance creation error:', err);
      res.status(400).json({ success: false, message: err.message || 'Failed to create ambulance' });
    }
  });

  router.put('/:ambulanceId', auth(['hospital', 'ambulance']), async (req, res) => {
    const existing = await Ambulance.findOne({ ambulanceId: req.params.ambulanceId });
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'hospital' && req.user.ref !== existing.hospitalId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (req.user.role === 'ambulance' && ![existing.ambulanceId, existing?.emt?.emtId, existing?.pilot?.pilotId].includes(req.user.ref)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const updated = await Ambulance.findOneAndUpdate({ ambulanceId: req.params.ambulanceId }, { $set: req.body }, { new: true });
    res.json({ success: true, ambulance: updated });
  });

  router.patch('/:ambulanceId/location', auth(['ambulance']), async (req, res) => {
    try {
      const { lat, lng } = req.body;
      const amb = await Ambulance.findOneAndUpdate(
        { ambulanceId: req.params.ambulanceId },
        { $set: { 'location.lat': lat, 'location.lng': lng, status: 'In Transit' } },
        { new: true }
      );
      io.to(`hospital_${amb.hospitalId}`).emit('ambulance:location', { ambulanceId: amb.ambulanceId, lat, lng });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.delete('/:ambulanceId', auth(['hospital']), async (req, res) => {
    const existing = await Ambulance.findOne({ ambulanceId: req.params.ambulanceId });
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'hospital' && req.user.ref !== existing.hospitalId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await Ambulance.findOneAndDelete({ ambulanceId: req.params.ambulanceId });
    res.json({ success: true });
  });

  // ==================== EMT & DRIVER REGISTRATION ====================

  const EMT = require('../models/EMT');
  const Driver = require('../models/Driver');

  // Register EMT
  router.post('/emt', auth(['hospital']), async (req, res) => {
    try {
      const { emtId, hospitalId, name, qualification, mobile, licenseNumber, licenseExpiryDate, ambulanceId } = req.body;

      // Verify hospital
      if (req.user.role === 'hospital' && req.user.ref !== hospitalId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      // Check if EMT ID already exists
      const existing = await EMT.findOne({ emtId });
      if (existing) {
        return res.status(400).json({ success: false, message: 'EMT ID already exists' });
      }

      const emt = new EMT({
        emtId,
        hospitalId,
        ambulanceId,
        name,
        qualification,
        mobile,
        licenseNumber,
        licenseExpiryDate: licenseExpiryDate ? new Date(licenseExpiryDate) : null,
        password: 'test@1234',
        forcePasswordChange: true,
        isActive: true
      });

      await emt.save();

      // If ambulance ID provided, update ambulance
      if (ambulanceId) {
        await Ambulance.findOneAndUpdate(
          { ambulanceId },
          {
            $set: {
              emtId: emtId,
              'emt.emtId': emtId,
              'emt.name': name,
              'emt.mobile': mobile
            }
          }
        );
      }

      res.json({ success: true, emt, message: 'EMT registered successfully. Default password: test@1234' });

    } catch (err) {
      console.error('EMT registration error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Register Driver
  router.post('/driver', auth(['hospital']), async (req, res) => {
    try {
      const { driverId, hospitalId, name, mobile, licenseNumber, licenseType, licenseExpiryDate, ambulanceId } = req.body;

      // Verify hospital
      if (req.user.role === 'hospital' && req.user.ref !== hospitalId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      // Check if Driver ID already exists
      const existing = await Driver.findOne({ driverId });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Driver ID already exists' });
      }

      const driver = new Driver({
        driverId,
        hospitalId,
        ambulanceId,
        name,
        mobile,
        licenseNumber,
        licenseType: licenseType || 'Commercial',
        licenseExpiryDate: new Date(licenseExpiryDate),
        password: 'test@1234',
        forcePasswordChange: true,
        isActive: true
      });

      await driver.save();

      // If ambulance ID provided, update ambulance
      if (ambulanceId) {
        await Ambulance.findOneAndUpdate(
          { ambulanceId },
          {
            $set: {
              driverId: driverId,
              'pilot.pilotId': driverId,
              'pilot.name': name,
              'pilot.mobile': mobile
            }
          }
        );
      }

      res.json({ success: true, driver, message: 'Driver registered successfully. Default password: test@1234' });

    } catch (err) {
      console.error('Driver registration error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get all EMTs for a hospital
  router.get('/emts/:hospitalId', async (req, res) => {
    try {
      const emts = await EMT.find({ hospitalId: req.params.hospitalId }).select('-password');
      res.json({ success: true, emts });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get all Drivers for a hospital
  router.get('/drivers/:hospitalId', async (req, res) => {
    try {
      const drivers = await Driver.find({ hospitalId: req.params.hospitalId }).select('-password');
      res.json({ success: true, drivers });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Update ambulance location (real-time tracking)
  router.put('/:ambulanceId/location', auth(['ambulance', 'emt', 'driver']), async (req, res) => {
    try {
      const { ambulanceId } = req.params;
      const { lat, lng } = req.body;

      const ambulance = await Ambulance.findOneAndUpdate(
        { ambulanceId },
        {
          $set: {
            'location.lat': lat,
            'location.lng': lng,
            lastLocationUpdate: new Date()
          }
        },
        { new: true }
      );

      if (!ambulance) {
        return res.status(404).json({ success: false, message: 'Ambulance not found' });
      }

      // Emit Socket.IO event for real-time tracking
      io.to(`hospital_${ambulance.hospitalId}`).emit('ambulance:location-update', {
        ambulanceId,
        location: { lat, lng },
        timestamp: new Date()
      });

      res.json({ success: true, location: ambulance.location });

    } catch (err) {
      console.error('Location update error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Calculate ETA (simple distance-based calculation)
  router.get('/:ambulanceId/eta', async (req, res) => {
    try {
      const { ambulanceId } = req.params;
      const { destLat, destLng } = req.query;

      const ambulance = await Ambulance.findOne({ ambulanceId });
      if (!ambulance) {
        return res.status(404).json({ success: false, message: 'Ambulance not found' });
      }

      if (!ambulance.location || !ambulance.location.lat || !ambulance.location.lng) {
        return res.status(400).json({ success: false, message: 'Ambulance location not available' });
      }

      // Calculate distance using Haversine formula
      const { calculateDistance } = require('../utils/distance');
      const distance = calculateDistance(
        ambulance.location.lat,
        ambulance.location.lng,
        parseFloat(destLat),
        parseFloat(destLng)
      );

      // Estimate ETA (assuming average speed of 40 km/h in city traffic)
      const distanceKm = distance / 1000;
      const etaMinutes = Math.round((distanceKm / 40) * 60);

      res.json({
        success: true,
        distance: distance, // meters
        distanceKm: distanceKm.toFixed(2),
        etaMinutes,
        ambulanceLocation: ambulance.location
      });

    } catch (err) {
      console.error('ETA calculation error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};



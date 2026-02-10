// routes/doctors.js
const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Hospital = require('../models/Hospital');
const { auth } = require('../middleware/auth');
const { calculateDistance, verifyLocation } = require('../utils/distance');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const multer = require('multer');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const hospitalId = req.body.hospitalId || 'default';
    const dir = path.join(__dirname, '..', 'uploads', 'hospitals', hospitalId, 'doctors');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

module.exports = (io) => {
  // Get single doctor by doctorId
  router.get('/doctor/:doctorId', async (req, res) => {
    try {
      const doctor = await Doctor.findOne({ doctorId: req.params.doctorId }).lean();
      if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
      res.json(doctor);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get('/:hospitalId', async (req, res) => {
    // If a hospital is logged in, enforce scoping
    if (req.user && req.user.role === 'hospital' && req.user.ref !== req.params.hospitalId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    // Optimized with .lean() for faster performance
    const doctors = await Doctor.find({ hospitalId: req.params.hospitalId }).lean();
    res.json(doctors);
  });

  router.post('/', auth(['hospital']), upload.single('photo'), async (req, res) => {
    try {
      if (req.user.role === 'hospital' && req.user.ref !== req.body.hospitalId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      // Validate required fields
      if (!req.body.doctorId || !req.body.hospitalId) {
        return res.status(400).json({ success: false, message: 'Doctor ID and Hospital ID are required' });
      }

      // Check if doctor already exists
      const existing = await Doctor.findOne({ doctorId: req.body.doctorId });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Doctor ID already exists' });
      }

      const photoUrl = req.file ? `/uploads/hospitals/${req.body.hospitalId}/doctors/${req.file.filename}` : '';

      const doc = new Doctor({
        ...req.body,
        password: 'test@1234',
        forcePasswordChange: true,
        photoUrl
      });
      await doc.save();
      res.json({ success: true, doctor: doc });
    } catch (err) {
      console.error('Doctor creation error:', err);
      res.status(400).json({ success: false, message: err.message || 'Failed to create doctor' });
    }
  });

  // Upload doctor photo
  router.post('/:doctorId/photo', auth(['doctor', 'hospital']), upload.single('photo'), async (req, res) => {
    try {
      const existing = await Doctor.findOne({ doctorId: req.params.doctorId });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Check permissions
      if (req.user.role === 'hospital' && req.user.ref !== existing.hospitalId) {
        return res.status(403).json({ success: false, message: 'Forbidden: Cannot upload photos for doctors from other hospitals' });
      }

      // For doctor role, check if token ref matches doctorId (case-insensitive)
      if (req.user.role === 'doctor') {
        const tokenRef = (req.user.ref || '').toUpperCase();
        const doctorId = (req.params.doctorId || '').toUpperCase();
        if (tokenRef !== doctorId) {
          console.error('Doctor photo auth mismatch:', { tokenRef, doctorId, user: req.user });
          return res.status(403).json({ success: false, message: 'Forbidden: Token does not match doctor ID' });
        }
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No photo file provided. Please select an image file.' });
      }

      // Validate file size (5MB max)
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'File size exceeds 5MB limit' });
      }

      const photoUrl = `/uploads/hospitals/${existing.hospitalId}/doctors/${req.file.filename}`;
      const updated = await Doctor.findOneAndUpdate(
        { doctorId: req.params.doctorId },
        { $set: { photoUrl } },
        { new: true }
      );

      res.json({ success: true, doctor: updated });
    } catch (err) {
      console.error('Doctor photo upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to upload photo' });
    }
  });

  router.put('/:doctorId', auth(['doctor', 'hospital']), async (req, res) => {
    try {
      const existing = await Doctor.findOne({ doctorId: req.params.doctorId });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Check permissions
      if (req.user.role === 'hospital' && req.user.ref !== existing.hospitalId) {
        return res.status(403).json({ success: false, message: 'Forbidden: Cannot update doctors from other hospitals' });
      }

      // For doctor role, check if token ref matches doctorId (case-insensitive)
      if (req.user.role === 'doctor') {
        const tokenRef = (req.user.ref || '').toUpperCase();
        const doctorId = (req.params.doctorId || '').toUpperCase();
        if (tokenRef !== doctorId) {
          console.error('Doctor auth mismatch:', { tokenRef, doctorId, user: req.user });
          return res.status(403).json({ success: false, message: 'Forbidden: Token does not match doctor ID' });
        }
      }

      const updated = await Doctor.findOneAndUpdate(
        { doctorId: req.params.doctorId },
        { $set: req.body },
        { new: true }
      );

      res.json({ success: true, doctor: updated });
    } catch (err) {
      console.error('Doctor update error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to update doctor profile' });
    }
  });

  router.delete('/:doctorId', auth(['hospital']), async (req, res) => {
    await Doctor.findOneAndDelete({ doctorId: req.params.doctorId });
    res.json({ success: true });
  });

  router.post('/attendance', auth(['doctor', 'hospital']), async (req, res) => {
    try {
      const { doctorId, date, availability, shift, method } = req.body;

      // Validate required fields
      if (!doctorId || !date || !availability) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: doctorId, date, and availability are required'
        });
      }

      // For doctor role, verify they can only mark their own attendance
      if (req.user.role === 'doctor') {
        const tokenRef = (req.user.ref || '').toUpperCase();
        const requestDoctorId = (doctorId || '').toUpperCase();
        if (tokenRef !== requestDoctorId) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: You can only mark your own attendance'
          });
        }
      }

      // For hospital role, verify doctor belongs to their hospital
      if (req.user.role === 'hospital') {
        const doctor = await Doctor.findOne({ doctorId });
        if (!doctor) {
          return res.status(404).json({ success: false, message: 'Doctor not found' });
        }
        if (doctor.hospitalId !== req.user.ref) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Cannot mark attendance for doctors from other hospitals'
          });
        }
      }

      const markedBy = req.user.role === 'doctor' ? 'Doctor' : 'Reception';
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);

      const att = await Attendance.findOneAndUpdate(
        { doctorId, date: day },
        { $set: { availability, shift: shift || 'Morning', markedBy, method: method || 'Manual' } },
        { upsert: true, new: true }
      );

      // Sync with Doctor model
      const docStatus = availability === 'Present' ? 'Available' : 'Not Available';
      await Doctor.findOneAndUpdate(
        { doctorId },
        { $set: { availability: docStatus } }
      );

      // Emit real-time update
      const doctor = await Doctor.findOne({ doctorId });
      if (doctor) {
        io.to(`hospital_${doctor.hospitalId}`).emit('doctor:attendance', {
          doctorId,
          hospitalId: doctor.hospitalId,
          availability: docStatus,
          shift: shift || 'Morning'
        });
        io.emit('doctor:update', { doctorId, availability: docStatus });
      }

      return res.json({ success: true, attendance: att });
    } catch (err) {
      console.error('Attendance update error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Failed to update attendance' });
    }
  });

  // Manual attendance update route for reception staff
  router.put('/attendance/manual-update', auth(['hospital']), async (req, res) => {
    try {
      const { doctorId, date, availability, shift } = req.body;

      // Validation
      if (!doctorId || !date || !availability) {
        return res.status(400).json({
          success: false,
          message: 'DoctorId, date, and availability (Present/Absent/Leave) are required'
        });
      }

      // Check if doctor exists and belongs to the requesting hospital
      const doctor = await Doctor.findOne({ doctorId });
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      if (req.user.ref !== doctor.hospitalId) {
        return res.status(403).json({ success: false, message: 'Cannot edit attendance for doctors from other hospitals' });
      }

      // Normalize date (remove time component)
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);

      // Update or create attendance record
      const att = await Attendance.findOneAndUpdate(
        { doctorId, date: day },
        {
          $set: {
            availability,
            shift: shift || 'Morning',
            markedBy: 'Reception',
            method: 'Manual Edit',
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      // Sync with Doctor model
      const docStatus = availability === 'Present' ? 'Available' : 'Not Available';
      await Doctor.findOneAndUpdate(
        { doctorId },
        { $set: { availability: docStatus } }
      );

      // Emit socket update
      io.emit('doctor:update', { doctorId, availability: docStatus });
      io.to(`hospital_${doctor.hospitalId}`).emit('attendance:updated', { doctorId, attendance: att });

      return res.json({ success: true, attendance: att, message: 'Attendance updated successfully' });
    } catch (err) {
      console.error('Manual attendance update error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.get('/attendance/:doctorId', async (req, res) => {
    const list = await Attendance.find({ doctorId: req.params.doctorId }).sort({ date: -1 });
    res.json(list);
  });

  // Generate QR for Present/Absent for a doctor
  router.get('/:doctorId/attendance/qrs', auth(['hospital', 'doctor']), async (req, res) => {
    try {
      const dir = path.join(__dirname, '..', 'uploads', 'qrs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const base = process.env.BASE_URL || 'http://localhost:5000';
      const presentUrl = `${base}/api/doctors/attendance/scan/${encodeURIComponent(req.params.doctorId)}?set=Present`;
      const absentUrl = `${base}/api/doctors/attendance/scan/${encodeURIComponent(req.params.doctorId)}?set=Absent`;
      const pPath = path.join(dir, `${req.params.doctorId}-present.png`);
      const aPath = path.join(dir, `${req.params.doctorId}-absent.png`);
      await QRCode.toFile(pPath, presentUrl);
      await QRCode.toFile(aPath, absentUrl);
      res.json({ present: `/uploads/qrs/${req.params.doctorId}-present.png`, absent: `/uploads/qrs/${req.params.doctorId}-absent.png` });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // Scan endpoint to mark attendance via QR
  router.get('/attendance/scan/:doctorId', async (req, res) => {
    try {
      const set = req.query.set;
      const shift = req.query.shift || 'Morning';

      if (!['Present', 'Absent'].includes(set)) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Invalid QR Scan</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc3545; background: #f8d7da; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>❌ Invalid QR Code</h2>
              <p>This QR code is not valid for attendance marking.</p>
            </div>
          </body>
          </html>
        `);
      }

      // Check if doctor exists
      const doctor = await Doctor.findOne({ doctorId: req.params.doctorId });
      if (!doctor) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Doctor Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc3545; background: #f8d7da; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>❌ Doctor Not Found</h2>
              <p>Doctor ID "${req.params.doctorId}" not found in system.</p>
            </div>
          </body>
          </html>
        `);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const att = await Attendance.findOneAndUpdate(
        { doctorId: req.params.doctorId, date: today },
        {
          $set: {
            availability: set,
            shift: shift,
            markedBy: 'Doctor',
            markedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      // Return success page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Attendance Marked</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
            .success { color: #155724; background: #d4edda; padding: 20px; border-radius: 8px; }
            .info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✅ Attendance Marked Successfully!</h2>
            <p><strong>Doctor:</strong> ${doctor.name || req.params.doctorId}</p>
            <p><strong>Status:</strong> ${set}</p>
            <p><strong>Shift:</strong> ${shift}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleTimeString()}</p>
          </div>
          <div class="info">
            <p>Your attendance has been recorded in the system.</p>
          </div>
        </body>
        </html>
      `);

    } catch (err) {
      console.error('Attendance scan error:', err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc3545; background: #f8d7da; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ System Error</h2>
            <p>Unable to mark attendance. Please try again or contact IT support.</p>
          </div>
        </body>
        </html>
      `);
    }
  });

  // ==================== GPS ATTENDANCE ENDPOINTS ====================

  // GPS Check-In
  router.post('/attendance/gps-check-in', auth(['doctor']), async (req, res) => {
    try {
      const { doctorId, location, shift } = req.body;

      // Verify doctor owns this attendance
      if (req.user.role === 'doctor' && req.user.ref.toUpperCase() !== doctorId.toUpperCase()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Can only mark your own attendance' });
      }

      // Get doctor and hospital info
      const doctor = await Doctor.findOne({ doctorId });
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      const hospital = await Hospital.findOne({ hospitalId: doctor.hospitalId });
      if (!hospital || !hospital.location || !hospital.location.lat || !hospital.location.lng) {
        return res.status(400).json({
          success: false,
          message: 'Hospital location not configured. Please contact administration.'
        });
      }

      // Verify location
      const verification = verifyLocation(
        location.lat,
        location.lng,
        hospital.location.lat,
        hospital.location.lng,
        100 // 100 meters radius
      );

      // Get today's date (normalized)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if already checked in today
      const existing = await Attendance.findOne({ doctorId, date: today });
      if (existing && existing.checkInTime) {
        return res.status(400).json({
          success: false,
          message: 'Already checked in today at ' + new Date(existing.checkInTime).toLocaleTimeString()
        });
      }

      // Create or update attendance record
      const attendance = await Attendance.findOneAndUpdate(
        { doctorId, date: today },
        {
          $set: {
            hospitalId: doctor.hospitalId,
            availability: 'Present',
            shift: shift || 'Morning',
            markedBy: 'Doctor',
            method: 'GPS',
            checkInTime: new Date(),
            checkInLocation: location,
            checkInVerified: verification.verified,
            checkInDistance: verification.distance
          }
        },
        { upsert: true, new: true }
      );

      // Update doctor availability
      await Doctor.findOneAndUpdate(
        { doctorId },
        { $set: { availability: 'Available', shift: shift || 'Morning' } }
      );

      // Emit socket event
      io.to(`hospital_${doctor.hospitalId}`).emit('doctor:gps-check-in', {
        doctorId,
        hospitalId: doctor.hospitalId,
        doctorName: doctor.name,
        checkInTime: attendance.checkInTime,
        verified: verification.verified,
        distance: verification.distance
      });

      res.json({
        success: true,
        attendance,
        verified: verification.verified,
        distance: verification.distance,
        message: verification.verified
          ? `✓ Verified check-in (${verification.distance}m from hospital)`
          : `⚠️ Unverified check-in (${verification.distance}m from hospital, outside 100m radius)`
      });

    } catch (err) {
      console.error('GPS check-in error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GPS Check-Out
  router.post('/attendance/gps-check-out', auth(['doctor']), async (req, res) => {
    try {
      const { doctorId, location } = req.body;

      // Verify doctor owns this attendance
      if (req.user.role === 'doctor' && req.user.ref.toUpperCase() !== doctorId.toUpperCase()) {
        return res.status(403).json({ success: false, message: 'Forbidden: Can only mark your own attendance' });
      }

      // Get doctor and hospital info
      const doctor = await Doctor.findOne({ doctorId });
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      const hospital = await Hospital.findOne({ hospitalId: doctor.hospitalId });
      if (!hospital || !hospital.location || !hospital.location.lat || !hospital.location.lng) {
        return res.status(400).json({
          success: false,
          message: 'Hospital location not configured. Please contact administration.'
        });
      }

      // Verify location
      const verification = verifyLocation(
        location.lat,
        location.lng,
        hospital.location.lat,
        hospital.location.lng,
        100
      );

      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find attendance record
      const attendance = await Attendance.findOne({ doctorId, date: today });
      if (!attendance || !attendance.checkInTime) {
        return res.status(400).json({
          success: false,
          message: 'No check-in found for today. Please check in first.'
        });
      }

      if (attendance.checkOutTime) {
        return res.status(400).json({
          success: false,
          message: 'Already checked out today at ' + new Date(attendance.checkOutTime).toLocaleTimeString()
        });
      }

      // Calculate hours worked
      const checkOutTime = new Date();
      const hoursWorked = (checkOutTime - attendance.checkInTime) / (1000 * 60 * 60);

      // Update attendance
      attendance.checkOutTime = checkOutTime;
      attendance.checkOutLocation = location;
      attendance.checkOutVerified = verification.verified;
      attendance.checkOutDistance = verification.distance;
      attendance.hoursWorked = Math.round(hoursWorked * 100) / 100; // Round to 2 decimals
      await attendance.save();

      // Update doctor availability
      await Doctor.findOneAndUpdate(
        { doctorId },
        { $set: { availability: 'Not Available' } }
      );

      // Emit socket event
      io.to(`hospital_${doctor.hospitalId}`).emit('doctor:gps-check-out', {
        doctorId,
        hospitalId: doctor.hospitalId,
        doctorName: doctor.name,
        checkOutTime: attendance.checkOutTime,
        hoursWorked: attendance.hoursWorked,
        verified: verification.verified,
        distance: verification.distance
      });

      res.json({
        success: true,
        attendance,
        hoursWorked: attendance.hoursWorked,
        verified: verification.verified,
        distance: verification.distance,
        message: `Checked out successfully. Worked ${attendance.hoursWorked} hours today.`
      });

    } catch (err) {
      console.error('GPS check-out error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ==================== LEAVE MANAGEMENT ENDPOINTS ====================

  // Request Leave
  router.post('/:doctorId/leave', auth(['doctor']), async (req, res) => {
    try {
      const { doctorId } = req.params;
      const { startDate, endDate, leaveType, reason } = req.body;

      // Verify doctor
      if (req.user.role === 'doctor' && req.user.ref.toUpperCase() !== doctorId.toUpperCase()) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const doctor = await Doctor.findOne({ doctorId });
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return res.status(400).json({ success: false, message: 'End date must be after start date' });
      }

      // Generate leave ID
      const leaveId = `LEAVE-${doctorId}-${Date.now()}`;

      const leave = new Leave({
        leaveId,
        doctorId,
        hospitalId: doctor.hospitalId,
        doctorName: doctor.name,
        startDate: start,
        endDate: end,
        leaveType,
        reason,
        status: 'Pending'
      });

      await leave.save();

      // Emit socket event
      io.to(`hospital_${doctor.hospitalId}`).emit('leave:requested', {
        leaveId,
        doctorId,
        doctorName: doctor.name,
        leaveType,
        startDate,
        endDate
      });

      res.json({ success: true, leave, message: 'Leave request submitted successfully' });

    } catch (err) {
      console.error('Leave request error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get Leave History
  router.get('/:doctorId/leaves', auth(['doctor', 'hospital']), async (req, res) => {
    try {
      const { doctorId } = req.params;

      // Verify permissions
      if (req.user.role === 'doctor' && req.user.ref.toUpperCase() !== doctorId.toUpperCase()) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const leaves = await Leave.find({ doctorId }).sort({ createdAt: -1 });
      res.json(leaves);

    } catch (err) {
      console.error('Get leaves error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Approve/Reject Leave (Hospital only)
  router.put('/:doctorId/leaves/:leaveId/approve', auth(['hospital']), async (req, res) => {
    try {
      const { leaveId } = req.params;
      const { status, rejectionReason, remarks } = req.body;

      if (!['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }

      const leave = await Leave.findOne({ leaveId });
      if (!leave) {
        return res.status(404).json({ success: false, message: 'Leave request not found' });
      }

      // Verify hospital owns this doctor
      if (req.user.ref !== leave.hospitalId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      leave.status = status;
      leave.approvedBy = req.user.ref;
      leave.approvedAt = new Date();
      if (status === 'Rejected' && rejectionReason) {
        leave.rejectionReason = rejectionReason;
      }
      if (remarks) {
        leave.remarks = remarks;
      }

      await leave.save();

      // Emit socket event
      io.emit('leave:updated', {
        leaveId,
        doctorId: leave.doctorId,
        status,
        approvedBy: req.user.ref
      });

      res.json({ success: true, leave, message: `Leave ${status.toLowerCase()} successfully` });

    } catch (err) {
      console.error('Leave approval error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};

// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });

let PORT = parseInt(process.env.PORT || '5000', 10);

// middleware - MUST come before logging
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware - shows all requests in terminal
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n🔵 [${timestamp}] ${req.method} ${req.url}`);
  if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  }
  if (req.headers.authorization) {
    console.log('🔑 Auth: Bearer token present');
  }

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    console.log(`✅ [${timestamp}] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    if (res.statusCode >= 400) {
      console.log('❌ Error Response:', data);
    }
    originalSend.call(this, data);
  };

  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// connect mongo (optimized - removed deprecated options)
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rapidcare')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    console.log('⚠️  Server will continue without MongoDB. Some features may not work.');
  });

// Handle MongoDB connection errors after initial connection
mongoose.connection.on('error', err => {
  console.error('MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Enhanced socket.io handling
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // Join hospital-specific room
  socket.on('joinHospitalRoom', (hospitalId) => {
    socket.join(`hospital_${hospitalId}`);
    console.log(`📡 Socket ${socket.id} joined hospital room: ${hospitalId}`);
  });

  // Join ambulance-specific room
  socket.on('joinAmbulanceRoom', (ambulanceId) => {
    socket.join(`ambulance_${ambulanceId}`);
    console.log(`📡 Socket ${socket.id} joined ambulance room: ${ambulanceId}`);
  });

  // Ambulance location tracking
  socket.on('ambulanceLocation', (payload) => {
    // payload: { ambulanceId, hospitalId, lat, lng }
    io.to(`hospital_${payload.hospitalId}`).emit('ambulance:location', payload);
    console.log(`🚑 Ambulance location update: ${payload.ambulanceId} at ${payload.lat}, ${payload.lng}`);
  });

  // Bed status updates
  socket.on('bedStatusUpdate', (payload) => {
    // payload: { bedId, hospitalId, status }
    io.to(`hospital_${payload.hospitalId}`).emit('bed:update', payload);
    // Also broadcast to public portal for live bed counts
    io.emit('bed:publicUpdate', payload);
    console.log(`🛏️ Bed status update: ${payload.bedId} -> ${payload.status}`);
  });

  // Doctor attendance updates
  socket.on('doctorAttendance', (payload) => {
    // payload: { doctorId, hospitalId, availability, shift }
    io.to(`hospital_${payload.hospitalId}`).emit('doctor:attendance', payload);
    // Broadcast to public portal for live doctor availability
    io.emit('doctor:publicUpdate', payload);
    console.log(`👨‍⚕️ Doctor attendance: ${payload.doctorId} -> ${payload.availability}`);
  });

  // Emergency request updates
  socket.on('emergencyUpdate', (payload) => {
    // payload: { emergencyId, hospitalId, status, reason, alternateHospitals }
    io.to(`hospital_${payload.hospitalId}`).emit('emergency:update', payload);
    console.log(`🚨 Emergency update: ${payload.emergencyId} -> ${payload.status}`);
  });

  // New emergency request
  socket.on('newEmergency', (payload) => {
    // payload: { emergencyId, hospitalId, patient, status }
    io.to(`hospital_${payload.hospitalId}`).emit('emergency:new', payload);
    console.log(`🚨 New emergency: ${payload.emergencyId} for hospital ${payload.hospitalId}`);
  });

  // Database reset notification
  socket.on('databaseReset', (payload) => {
    // Broadcast to all connected clients
    io.emit('database:reset', payload);
    console.log(`🔄 Database reset notification sent to all clients`);
  });

  // ==================== NEW SOCKET.IO EVENTS ====================

  // GPS Attendance events
  socket.on('doctor:gps-check-in', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('doctor:gps-check-in', payload);
    console.log(`📍 Doctor GPS check-in: ${payload.doctorId} - ${payload.verified ? 'Verified' : 'Unverified'}`);
  });

  socket.on('doctor:gps-check-out', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('doctor:gps-check-out', payload);
    console.log(`📍 Doctor GPS check-out: ${payload.doctorId} - ${payload.hoursWorked}h worked`);
  });

  // Bed discharge events
  socket.on('bed:discharged', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('bed:discharged', payload);
    console.log(`🛏️ Bed discharged: ${payload.bedId} → Cleaning`);
  });

  socket.on('bed:cleaned', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('bed:cleaned', payload);
    io.emit('bed:publicUpdate', payload);
    console.log(`🛏️ Bed cleaned: ${payload.bedId} → Vacant`);
  });

  // Blood bank events
  socket.on('blood:added', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('blood:added', payload);
    console.log(`🩸 Blood added: ${payload.bloodType} +${payload.quantity} units`);
  });

  socket.on('blood:used', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('blood:used', payload);
    console.log(`🩸 Blood used: ${payload.bloodType} -${payload.unitsUsed} units`);
  });

  socket.on('blood:low-stock', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('blood:low-stock', payload);
    console.log(`⚠️ Low blood stock: ${payload.bloodType} - ${payload.totalUnits} units`);
  });

  // Announcement events
  socket.on('announcement:posted', (payload) => {
    io.emit('announcement:posted', payload);
    console.log(`📢 Announcement posted: ${payload.hospitalId} - ${payload.title}`);
  });

  socket.on('announcement:updated', (payload) => {
    io.emit('announcement:updated', payload);
    console.log(`📢 Announcement updated: ${payload.announcementId}`);
  });

  socket.on('announcement:deleted', (payload) => {
    io.emit('announcement:deleted', payload);
    console.log(`📢 Announcement deleted: ${payload.announcementId}`);
  });

  // Leave request events
  socket.on('leave:requested', (payload) => {
    io.to(`hospital_${payload.hospitalId}`).emit('leave:requested', payload);
    console.log(`📅 Leave requested: ${payload.doctorName} - ${payload.leaveType}`);
  });

  socket.on('leave:updated', (payload) => {
    io.emit('leave:updated', payload);
    console.log(`📅 Leave ${payload.status}: ${payload.doctorId}`);
  });

  // Hospital info updates
  socket.on('hospitalInfoUpdate', (payload) => {
    // payload: { hospitalId, updates }
    io.to(`hospital_${payload.hospitalId}`).emit('hospital:update', payload);
    // Also broadcast to public portal
    io.emit('hospital:publicUpdate', payload);
    console.log(`🏥 Hospital info update: ${payload.hospitalId}`);
  });

  // Real-time notifications
  socket.on('notification', (payload) => {
    // payload: { type, message, hospitalId?, targetUserId? }
    if (payload.hospitalId) {
      io.to(`hospital_${payload.hospitalId}`).emit('notification', payload);
    } else {
      io.emit('notification', payload);
    }
    console.log(`📢 Notification: ${payload.type} - ${payload.message}`);
  });

  // Ambulance heartbeat - keeps status as "On Duty"
  socket.on('ambulance:heartbeat', (payload) => {
    // payload: { ambulanceId, hospitalId, status, location }
    io.to(`hospital_${payload.hospitalId}`).emit('ambulance:statusUpdate', {
      ambulanceId: payload.ambulanceId,
      status: payload.status || 'On Duty',
      location: payload.location || null,
      lastSeen: new Date()
    });
    console.log(`💓 Ambulance heartbeat: ${payload.ambulanceId} - ${payload.status}`);
  });

  // Ambulance status change (manual)
  socket.on('ambulance:statusChange', (payload) => {
    // payload: { ambulanceId, hospitalId, status, location }
    io.to(`hospital_${payload.hospitalId}`).emit('ambulance:statusUpdate', {
      ambulanceId: payload.ambulanceId,
      status: payload.status,
      location: payload.location,
      lastSeen: new Date()
    });
    console.log(`🎛️ Ambulance status changed: ${payload.ambulanceId} → ${payload.status}`);
  });

  // Ambulance disconnect - updates status to "Offline"
  socket.on('ambulance:disconnect', (payload) => {
    // payload: { ambulanceId, hospitalId }
    io.to(`hospital_${payload.hospitalId}`).emit('ambulance:statusUpdate', {
      ambulanceId: payload.ambulanceId,
      status: 'Offline',
      location: null,
      lastSeen: new Date()
    });
    console.log(`📴 Ambulance disconnected: ${payload.ambulanceId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// load routes
app.use('/api/hospital', require('./routes/hospital')(io));
app.use('/api/beds', require('./routes/beds')(io));
app.use('/api/doctors', require('./routes/doctors')(io));
app.use('/api/ambulances', require('./routes/ambulances')(io));
app.use('/api/emergency', require('./routes/emergency')(io));
app.use('/api/blood-bank', require('./routes/bloodBank')(io));
app.use('/api/announcements', require('./routes/announcements')(io));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reset', require('./routes/reset')(io));

// Global error handler - catches all errors
const { sendErrorResponse, handleValidationError, handleDuplicateKeyError, handleCastError } = require('./utils/errorHandler');

app.use((err, req, res, next) => {
  const timestamp = new Date().toLocaleTimeString();
  console.error(`\n❌❌❌ [${timestamp}] ERROR in ${req.method} ${req.url}`);
  console.error('Error Message:', err.message);
  console.error('Error Stack:', err.stack);

  // Handle specific error types
  let error = err;
  if (err.name === 'ValidationError') error = handleValidationError(err);
  if (err.code === 11000) error = handleDuplicateKeyError(err);
  if (err.name === 'CastError') error = handleCastError(err);

  sendErrorResponse(error, req, res);
});

// 404 handler
app.use((req, res) => {
  console.log(`\n⚠️  404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ message: 'Route not found' });
});

function startServer(port) {
  // Remove previous error listeners to avoid stacking on retries
  server.removeAllListeners('error');

  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`\n⚠️  Port ${port} is in use. Trying ${nextPort}...`);
      startServer(nextPort);
    } else {
      throw err;
    }
  });

  server.listen(port, () => {
    PORT = port;
    console.log('\n' + '='.repeat(50));
    console.log(`🚀 RapidCare Server Started`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📊 Logging: ENABLED (all requests will be logged)`);
    console.log('='.repeat(50) + '\n');
  });
}

startServer(PORT);




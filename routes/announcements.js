// routes/announcements.js
const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { auth } = require('../middleware/auth');

module.exports = (io) => {
    // Get active announcements for a hospital
    router.get('/:hospitalId', async (req, res) => {
        try {
            const { hospitalId } = req.params;

            const announcements = await Announcement.find({
                hospitalId,
                isActive: true,
                expiresAt: { $gt: new Date() }
            }).sort({ createdAt: -1 }).limit(10);

            res.json({ success: true, announcements });

        } catch (err) {
            console.error('Get announcements error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Create announcement
    router.post('/', auth(['hospital']), async (req, res) => {
        try {
            const { hospitalId, title, content, type, priority } = req.body;

            // Verify hospital
            if (req.user.role === 'hospital' && req.user.ref !== hospitalId) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            // Validate content length
            if (content.length > 500) {
                return res.status(400).json({ success: false, message: 'Content too long (max 500 characters)' });
            }

            // Generate announcement ID
            const announcementId = `ANN-${hospitalId}-${Date.now()}`;

            // Set expiry to 24 hours from now
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            const announcement = new Announcement({
                announcementId,
                hospitalId,
                title,
                content,
                type: type || 'General',
                priority: priority || 'Medium',
                createdBy: req.user.ref,
                expiresAt,
                isActive: true
            });

            await announcement.save();

            // Emit socket event to all users
            io.emit('announcement:posted', {
                hospitalId,
                announcementId,
                title,
                content,
                type,
                priority
            });

            res.json({
                success: true,
                announcement,
                message: 'Announcement posted successfully. Will expire in 24 hours.'
            });

        } catch (err) {
            console.error('Create announcement error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Update announcement
    router.put('/:announcementId', auth(['hospital']), async (req, res) => {
        try {
            const { announcementId } = req.params;
            const { title, content, type, priority } = req.body;

            const announcement = await Announcement.findOne({ announcementId });
            if (!announcement) {
                return res.status(404).json({ success: false, message: 'Announcement not found' });
            }

            // Verify hospital
            if (req.user.role === 'hospital' && req.user.ref !== announcement.hospitalId) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            // Update fields
            if (title) announcement.title = title;
            if (content) {
                if (content.length > 500) {
                    return res.status(400).json({ success: false, message: 'Content too long (max 500 characters)' });
                }
                announcement.content = content;
            }
            if (type) announcement.type = type;
            if (priority) announcement.priority = priority;

            await announcement.save();

            // Emit socket event
            io.emit('announcement:updated', {
                hospitalId: announcement.hospitalId,
                announcementId,
                title: announcement.title,
                content: announcement.content,
                type: announcement.type,
                priority: announcement.priority
            });

            res.json({ success: true, announcement, message: 'Announcement updated successfully' });

        } catch (err) {
            console.error('Update announcement error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Delete announcement
    router.delete('/:announcementId', auth(['hospital']), async (req, res) => {
        try {
            const { announcementId } = req.params;

            const announcement = await Announcement.findOne({ announcementId });
            if (!announcement) {
                return res.status(404).json({ success: false, message: 'Announcement not found' });
            }

            // Verify hospital
            if (req.user.role === 'hospital' && req.user.ref !== announcement.hospitalId) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            // Soft delete (mark as inactive)
            announcement.isActive = false;
            await announcement.save();

            // Emit socket event
            io.emit('announcement:deleted', {
                hospitalId: announcement.hospitalId,
                announcementId
            });

            res.json({ success: true, message: 'Announcement deleted successfully' });

        } catch (err) {
            console.error('Delete announcement error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    return router;
};

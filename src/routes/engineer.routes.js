const express = require('express');
const User = require('../models/user.model');
const Assignment = require('../models/assignment.model');
const { auth, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Get all engineers
router.get('/', auth, authorize(['manager']), async (req, res) => {
  try {
    const query = { role: 'engineer' };

    // Add search functionality
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by skills if provided
    if (req.query.skills) {
      const skills = Array.isArray(req.query.skills) ? req.query.skills : [req.query.skills];
      query.skills = { $in: skills };
    }

    // Filter by seniority if provided
    if (req.query.seniority) {
      query.seniority = req.query.seniority;
    }

    // Filter by availability if provided
    if (req.query.availability) {
      const minAvailability = parseInt(req.query.availability);
      // This will be handled by the frontend based on current assignments
    }

    const engineers = await User.find(query)
      .select('-password')
      .sort({ name: 1 });
    
    res.json(engineers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching engineers' });
  }
});

// Get engineer by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const engineer = await User.findOne({
      _id: req.params.id,
      role: 'engineer'
    }).select('-password');

    if (!engineer) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    res.json(engineer);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching engineer' });
  }
});

// Get engineer's capacity
router.get('/:id/capacity', auth, async (req, res) => {
  try {
    const engineer = await User.findOne({
      _id: req.params.id,
      role: 'engineer'
    });

    if (!engineer) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const assignments = await Assignment.find({
      engineerId: engineer._id,
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart }
    }).populate('projectId', 'name');

    const capacity = {
      maxCapacity: engineer.maxCapacity,
      currentAllocations: assignments.map(assignment => ({
        project: assignment.projectId.name,
        percentage: assignment.allocationPercentage,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        role: assignment.role
      })),
      totalAllocated: assignments.reduce((sum, assignment) => sum + assignment.allocationPercentage, 0),
      availableCapacity: engineer.maxCapacity - assignments.reduce((sum, assignment) => sum + assignment.allocationPercentage, 0)
    };

    res.json(capacity);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching capacity' });
  }
});

// Search engineers by skills
router.get('/search/skills', auth, async (req, res) => {
  try {
    const { skills } = req.query;
    if (!skills) {
      return res.status(400).json({ message: 'Skills parameter is required' });
    }

    const skillsArray = skills.split(',').map(skill => skill.trim());
    
    const engineers = await User.find({
      role: 'engineer',
      skills: { $in: skillsArray }
    }).select('-password');

    res.json(engineers);
  } catch (error) {
    res.status(500).json({ message: 'Error searching engineers' });
  }
});

// Get engineer's assignments
router.get('/:id/assignments', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({
      engineerId: req.params.id
    })
    .populate('projectId', 'name description status')
    .sort({ startDate: 1 });

    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Check engineer's availability
router.get('/:id/availability', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    const availability = await Assignment.checkAvailability(
      req.params.id,
      new Date(startDate),
      new Date(endDate)
    );

    res.json(availability);
  } catch (error) {
    res.status(500).json({ message: 'Error checking availability' });
  }
});

module.exports = router; 
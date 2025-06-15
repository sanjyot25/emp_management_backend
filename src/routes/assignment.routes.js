const express = require('express');
const { body, validationResult } = require('express-validator');
const Assignment = require('../models/assignment.model');
const Project = require('../models/project.model');
const User = require('../models/user.model');
const { auth, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Validation middleware
const validateAssignment = [
  body('engineerId').isMongoId(),
  body('projectId').isMongoId(),
  body('allocationPercentage').isInt({ min: 0, max: 100 }),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('role').trim().notEmpty()
];

// Create assignment
router.post('/', auth, authorize(['manager']), validateAssignment, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Verify project exists and is managed by the current user
    const project = await Project.findOne({
      _id: req.body.projectId,
      managerId: req.user._id
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Verify engineer exists
    const engineer = await User.findOne({
      _id: req.body.engineerId,
      role: 'engineer'
    });

    if (!engineer) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    // Check engineer's availability
    const availability = await Assignment.checkAvailability(
      req.body.engineerId,
      new Date(req.body.startDate),
      new Date(req.body.endDate)
    );

    if (!availability.isAvailable) {
      return res.status(400).json({
        message: 'Engineer does not have sufficient capacity for this assignment',
        allocations: availability.allocations
      });
    }

    const assignment = new Assignment(req.body);
    await assignment.save();

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate('engineerId', 'name email skills')
      .populate('projectId', 'name description');

    res.status(201).json(populatedAssignment);
  } catch (error) {
    res.status(500).json({ message: 'Error creating assignment' });
  }
});

// Get all assignments
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    // Filter by project
    if (req.query.projectId) {
      query.projectId = req.query.projectId;
    }

    // Filter by engineer
    if (req.query.engineerId) {
      query.engineerId = req.query.engineerId;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.startDate = { $lte: new Date(req.query.endDate) };
      query.endDate = { $gte: new Date(req.query.startDate) };
    }

    const assignments = await Assignment.find(query)
      .populate('engineerId', 'name email skills')
      .populate('projectId', 'name description status')
      .sort({ startDate: 1 });

    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get assignment by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('engineerId', 'name email skills')
      .populate('projectId', 'name description status');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assignment' });
  }
});

// Update assignment
router.patch('/:id', auth, authorize(['manager']), async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['allocationPercentage', 'startDate', 'endDate', 'role'];
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ message: 'Invalid updates' });
  }

  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('projectId');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Verify the project belongs to the manager
    if (assignment.projectId.managerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this assignment' });
    }

    // Check capacity if allocation percentage is being updated
    if (req.body.allocationPercentage) {
      const availability = await Assignment.checkAvailability(
        assignment.engineerId,
        assignment.startDate,
        assignment.endDate
      );

      if (!availability.isAvailable) {
        return res.status(400).json({
          message: 'Engineer does not have sufficient capacity for this update',
          allocations: availability.allocations
        });
      }
    }

    updates.forEach(update => assignment[update] = req.body[update]);
    await assignment.save();

    const updatedAssignment = await Assignment.findById(assignment._id)
      .populate('engineerId', 'name email skills')
      .populate('projectId', 'name description');

    res.json(updatedAssignment);
  } catch (error) {
    res.status(400).json({ message: 'Error updating assignment' });
  }
});

// Delete assignment
router.delete('/:id', auth, authorize(['manager']), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('projectId');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Verify the project belongs to the manager
    if (assignment.projectId.managerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this assignment' });
    }

    await assignment.remove();
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting assignment' });
  }
});

module.exports = router; 
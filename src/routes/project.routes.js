const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/project.model');
const Assignment = require('../models/assignment.model');
const { auth, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Validation middleware
const validateProject = [
  body('name').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('requiredSkills').isArray(),
  body('teamSize').isInt({ min: 1 }),
  body('status').isIn(['planning', 'active', 'completed'])
];

// Create project
router.post('/', auth, authorize(['manager']), validateProject, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const project = new Project({
      ...req.body,
      managerId: req.user._id
    });

    await project.save();
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error creating project' });
  }
});

// Get all projects
router.get('/', auth, async (req, res) => {
  try {
    const query = {};
    
    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by manager
    if (req.user.role === 'manager') {
      query.managerId = req.user._id;
    }

    // Add search functionality
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by skills if provided
    if (req.query.skills) {
      const skills = Array.isArray(req.query.skills) ? req.query.skills : [req.query.skills];
      query.requiredSkills = { $in: skills };
    }

    const projects = await Project.find(query)
      .populate('managerId', 'name email')
      .sort({ startDate: 1 })
      .lean();

    if (!projects) {
      return res.status(404).json({ 
        message: 'No projects found',
        error: 'NOT_FOUND'
      });
    }

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Invalid query parameters',
        error: 'VALIDATION_ERROR',
        details: error.message
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid ID format',
        error: 'INVALID_ID'
      });
    }

    res.status(500).json({ 
      message: 'Internal server error while fetching projects',
      error: 'INTERNAL_ERROR'
    });
  }
});

// Get project by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('managerId', 'name email');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get project team
    const assignments = await Assignment.find({ projectId: project._id })
      .populate('engineerId', 'name email skills seniority');

    const response = {
      ...project.toObject(),
      team: assignments.map(assignment => ({
        engineer: assignment.engineerId,
        role: assignment.role,
        allocationPercentage: assignment.allocationPercentage,
        startDate: assignment.startDate,
        endDate: assignment.endDate
      }))
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project' });
  }
});

// Update project
router.patch('/:id', auth, authorize(['manager']), async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['name', 'description', 'startDate', 'endDate', 'requiredSkills', 'teamSize', 'status'];
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ message: 'Invalid updates' });
  }

  try {
    const project = await Project.findOne({
      _id: req.params.id,
      managerId: req.user._id
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    updates.forEach(update => project[update] = req.body[update]);
    await project.save();
    res.json(project);
  } catch (error) {
    res.status(400).json({ message: 'Error updating project' });
  }
});

// Delete project
router.delete('/:id', auth, authorize(['manager']), async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      managerId: req.user._id
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if project has active assignments
    const activeAssignments = await Assignment.find({
      projectId: project._id,
      endDate: { $gte: new Date() }
    });

    if (activeAssignments.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete project with active assignments'
      });
    }

    await project.remove();
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting project' });
  }
});

// Search projects by skills
router.get('/search/skills', auth, async (req, res) => {
  try {
    const { skills } = req.query;
    if (!skills) {
      return res.status(400).json({ message: 'Skills parameter is required' });
    }

    const skillsArray = skills.split(',').map(skill => skill.trim());
    
    const projects = await Project.find({
      requiredSkills: { $in: skillsArray }
    }).populate('managerId', 'name email');

    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error searching projects' });
  }
});

module.exports = router; 
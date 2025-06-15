const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  requiredSkills: [{
    type: String,
    trim: true
  }],
  teamSize: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'completed'],
    default: 'planning'
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    validate: {
      validator: async function(value) {
        const User = mongoose.model('User');
        const manager = await User.findById(value);
        return manager && manager.role === 'manager';
      },
      message: 'Invalid manager ID'
    }
  }
}, {
  timestamps: true
});

// Add index for common queries
projectSchema.index({ status: 1, managerId: 1 });
projectSchema.index({ startDate: 1, endDate: 1 });

// Virtual for current team size
projectSchema.virtual('currentTeamSize', {
  ref: 'Assignment',
  localField: '_id',
  foreignField: 'projectId',
  count: true
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project; 
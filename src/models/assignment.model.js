const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    validate: {
      validator: async function(value) {
        const User = mongoose.model('User');
        const engineer = await User.findById(value);
        return engineer && engineer.role === 'engineer';
      },
      message: 'Invalid engineer ID'
    }
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  allocationPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    validate: {
      validator: async function(value) {
        if (this.isNew || this.isModified('allocationPercentage')) {
          const Assignment = this.constructor;
          const currentAssignments = await Assignment.find({
            engineerId: this.engineerId,
            _id: { $ne: this._id },
            startDate: { $lte: this.endDate },
            endDate: { $gte: this.startDate }
          });
          
          const totalAllocation = currentAssignments.reduce(
            (sum, assignment) => sum + assignment.allocationPercentage,
            0
          ) + value;
          
          return totalAllocation <= 100;
        }
        return true;
      },
      message: 'Total allocation percentage cannot exceed 100%'
    }
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
  role: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

// Add indexes for common queries
assignmentSchema.index({ engineerId: 1, startDate: 1, endDate: 1 });
assignmentSchema.index({ projectId: 1, startDate: 1, endDate: 1 });

// Method to check engineer's availability
assignmentSchema.statics.checkAvailability = async function(engineerId, startDate, endDate) {
  const assignments = await this.find({
    engineerId,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  });

  const timelineMap = new Map();
  assignments.forEach(assignment => {
    let current = new Date(assignment.startDate);
    while (current <= assignment.endDate) {
      const dateKey = current.toISOString().split('T')[0];
      timelineMap.set(
        dateKey,
        (timelineMap.get(dateKey) || 0) + assignment.allocationPercentage
      );
      current.setDate(current.getDate() + 1);
    }
  });

  return {
    isAvailable: Array.from(timelineMap.values()).every(value => value < 100),
    allocations: Object.fromEntries(timelineMap)
  };
};

const Assignment = mongoose.model('Assignment', assignmentSchema);

module.exports = Assignment; 
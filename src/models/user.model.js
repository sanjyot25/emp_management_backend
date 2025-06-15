const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['engineer', 'manager'],
    required: true
  },
  skills: [{
    type: String,
    trim: true
  }],
  seniority: {
    type: String,
    enum: ['junior', 'mid', 'senior'],
    required: function() {
      return this.role === 'engineer';
    }
  },
  maxCapacity: {
    type: Number,
    required: function() {
      return this.role === 'engineer';
    },
    min: 0,
    max: 100,
    default: 100
  },
  department: {
    type: String,
    trim: true,
    required: function() {
      return this.role === 'engineer';
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile (exclude sensitive data)
userSchema.methods.toPublicJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User; 
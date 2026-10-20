const mongoose = require('mongoose');

const CollectionAssignmentSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    delinquency_case_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DelinquencyCase',
      required: true,
      index: true
    },
    assigned_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    assigned_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },
    status: {
      type: String,
      enum: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'TRANSFERRED'],
      default: 'ASSIGNED',
      index: true
    },
    notes: {
      type: String,
      default: ''
    },
    assigned_at: {
      type: Date,
      default: Date.now
    },
    resolved_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'collection_assignments'
  }
);

CollectionAssignmentSchema.index({ tenant_id: 1, delinquency_case_id: 1, assigned_at: -1 });

module.exports = mongoose.model('CollectionAssignment', CollectionAssignmentSchema);

const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema(
  {
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Student rating mentor
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Mentor being rated
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true }, // Associated booking
    rating: { type: Number, required: true, min: 1, max: 5 }, // 1-5 stars
    comment: { type: String, default: '', maxlength: 1000 }, // Optional review comment
    categories: {
      communication: { type: Number, min: 1, max: 5 }, // How clear they were
      expertise: { type: Number, min: 1, max: 5 }, // Knowledge level
      punctuality: { type: Number, min: 1, max: 5 }, // On-time attendance
      helpfulness: { type: Number, min: 1, max: 5 }, // How helpful they were
    },
    helpful: { type: Number, default: 0 }, // Number of people who found this review helpful
    
    // Admin fields
    adminReviewNotes: { type: String, default: '', maxlength: 2000 }, // Admin review/notes
    adminReviewedAt: { type: Date, default: null }, // When admin last reviewed this rating
    isModifiedByAdmin: { type: Boolean, default: false }, // Flag indicating admin has modified this rating
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Index for finding ratings for a specific mentor
RatingSchema.index({ mentor: 1, createdAt: -1 });
RatingSchema.index({ reviewer: 1, createdAt: -1 });
RatingSchema.index({ booking: 1 });
RatingSchema.index({ adminReviewedAt: 1 }); // For admin review tracking

module.exports = mongoose.model('Rating', RatingSchema);

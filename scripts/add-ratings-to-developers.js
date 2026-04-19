const mongoose = require('mongoose')
require('dotenv').config({ path: '.env' })

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Rating Schema
const ratingSchema = new mongoose.Schema({
  rating: Number,
  comment: String,
  categories: {
    communication: Number,
    expertise: Number,
    punctuality: Number,
    helpfulness: Number,
  },
  reviewer: {
    _id: mongoose.Schema.Types.ObjectId,
    firstName: String,
    lastName: String,
    email: String,
    avatar: String,
  },
  mentor: {
    _id: mongoose.Schema.Types.ObjectId,
    firstName: String,
    lastName: String,
    email: String,
    role: String,
    rating: Number,
  },
  booking: {
    _id: mongoose.Schema.Types.ObjectId,
    startTime: Date,
    endTime: Date,
  },
  adminReviewNotes: String,
  adminReviewedAt: Date,
  isModifiedByAdmin: Boolean,
  createdAt: { type: Date, default: Date.now },
})

const Rating = mongoose.model('Rating', ratingSchema)

// User Schema
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: String,
  rating: Number,
})

const User = mongoose.model('User', userSchema)

async function addRatingsToDevs() {
  try {
    // Find all developers/mentors
    const mentors = await User.find({ role: { $in: ['mentor', 'developer'] } }).limit(10)
    const allUsers = await User.find({})

    console.log(`Found ${mentors.length} mentors`)
    console.log(`Found ${allUsers.length} total users`)

    if (mentors.length === 0) {
      console.log('No mentors found!')
      return
    }

    if (allUsers.length < 2) {
      console.log('Not enough users to create ratings')
      return
    }

    // Sample comments
    const comments = [
      'Great mentor, very helpful and knowledgeable!',
      'Excellent teaching style, would recommend',
      'Knew exactly what I needed, very professional',
      'Amazing guidance and support throughout',
      'Highly skilled and patient instructor',
      'Best session I had, learned so much',
      'Very responsive and dedicated mentor',
      'Exceeded my expectations!',
    ]

    // Sample ratings
    const ratings = [4, 5, 5, 4, 5, 3, 5, 4, 4, 5]

    let totalCreated = 0

    // Add 3-5 ratings per mentor
    for (const mentor of mentors) {
      const numRatings = Math.floor(Math.random() * 3) + 3 // 3-5 ratings per mentor

      for (let i = 0; i < numRatings; i++) {
        // Pick random reviewer (not the mentor themselves)
        const randomReviewer = allUsers[Math.floor(Math.random() * allUsers.length)]
        if (randomReviewer._id.toString() === mentor._id.toString()) continue

        const ratingValue = ratings[Math.floor(Math.random() * ratings.length)]
        const comment = comments[Math.floor(Math.random() * comments.length)]

        const newRating = new Rating({
          rating: ratingValue,
          comment: comment,
          categories: {
            communication: ratingValue - Math.random(),
            expertise: ratingValue - Math.random(),
            punctuality: ratingValue - Math.random(),
            helpfulness: ratingValue,
          },
          reviewer: {
            _id: randomReviewer._id,
            firstName: randomReviewer.firstName,
            lastName: randomReviewer.lastName,
            email: randomReviewer.email,
          },
          mentor: {
            _id: mentor._id,
            firstName: mentor.firstName,
            lastName: mentor.lastName,
            email: mentor.email,
            role: mentor.role,
            rating: mentor.rating || 0,
          },
          isModifiedByAdmin: false,
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
        })

        await newRating.save()
        console.log(`✅ Added rating for ${mentor.firstName} ${mentor.lastName} from ${randomReviewer.firstName}`)
        totalCreated++
      }

      // Update mentor average rating
      const mentorRatings = await Rating.find({ 'mentor._id': mentor._id })
      const avgRating =
        mentorRatings.reduce((sum, r) => sum + r.rating, 0) / mentorRatings.length

      await User.findByIdAndUpdate(mentor._id, {
        rating: parseFloat(avgRating.toFixed(2)),
      })

      console.log(`📊 Updated ${mentor.firstName}'s average rating to ${avgRating.toFixed(2)}`)
    }

    console.log(`\n✨ Successfully created ${totalCreated} ratings!`)
    console.log('Now you can see developers with ratings in the Ratings Management page.')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    mongoose.connection.close()
    process.exit(0)
  }
}

addRatingsToDevs()

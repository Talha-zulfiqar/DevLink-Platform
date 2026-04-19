const mongoose = require('mongoose')
require('dotenv').config({ path: '.env' })

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

const ratingSchema = new mongoose.Schema({}, { strict: false })
const Rating = mongoose.model('Rating', ratingSchema, 'ratings')

async function fixRatings() {
  try {
    console.log('Fetching all ratings...')
    const ratings = await Rating.find({})
    console.log(`Found ${ratings.length} ratings`)

    let fixed = 0

    for (const rating of ratings) {
      // Check if mentor is an object (embedded) instead of ObjectId
      if (rating.mentor && typeof rating.mentor === 'object' && rating.mentor._id) {
        console.log(`Fixing rating: mentor was object, converting to ID`)
        rating.mentor = rating.mentor._id
        await rating.save()
        fixed++
      }

      // Check if reviewer is an object (embedded) instead of ObjectId
      if (rating.reviewer && typeof rating.reviewer === 'object' && rating.reviewer._id) {
        console.log(`Fixing rating: reviewer was object, converting to ID`)
        rating.reviewer = rating.reviewer._id
        await rating.save()
      }

      // Check if booking is an object (embedded) instead of ObjectId
      if (rating.booking && typeof rating.booking === 'object' && rating.booking._id) {
        console.log(`Fixing rating: booking was object, converting to ID`)
        rating.booking = rating.booking._id
        await rating.save()
      }
    }

    console.log(`\n✅ Fixed ${fixed} ratings!`)
    console.log('Ratings should now work with populate()')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    mongoose.connection.close()
    process.exit(0)
  }
}

fixRatings()

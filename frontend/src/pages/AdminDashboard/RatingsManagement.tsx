import React, { useState, useEffect } from 'react'
import { Star, Edit2, Trash2, ChevronDown, ChevronUp, AlertCircle, Save, X } from 'lucide-react'
import { useToast } from '../../components/UX/ToastProvider'

interface Rating {
  _id: string
  rating: number
  comment: string
  categories?: {
    communication?: number
    expertise?: number
    punctuality?: number
    helpfulness?: number
  }
  reviewer: {
    _id: string
    firstName: string
    lastName: string
    email: string
    avatar?: string
  }
  mentor: {
    _id: string
    firstName: string
    lastName: string
    email: string
    role: string
    rating: number
  }
  booking?: {
    _id: string
    startTime: string
    endTime: string
  }
  adminReviewNotes?: string
  adminReviewedAt?: string
  isModifiedByAdmin?: boolean
  createdAt: string
}

export default function RatingsManagement() {
  const toast = useToast()
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
  const adminToken = typeof window !== 'undefined' 
    ? (localStorage.getItem('devlink_admin_token') || 
       localStorage.getItem('adminToken') || 
       localStorage.getItem('ADMIN_TOKEN')) 
    : null

  const [ratings, setRatings] = useState<Rating[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedMentor, setExpandedMentor] = useState<string | null>(null)
  const [editingRating, setEditingRating] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Rating> | null>(null)

  // Fetch all ratings
  const fetchRatings = async () => {
    if (!adminToken) {
      toast.show('Admin token required', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/admin/ratings?limit=1000`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) throw new Error('Failed to fetch ratings')

      const data = await response.json()
      setRatings(data.data.ratings || [])
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
      console.error('Fetch ratings error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRatings()
  }, [])

  // Update rating
  const handleUpdateRating = async (ratingId: string) => {
    if (!editData || !adminToken) return

    try {
      const response = await fetch(`${API_BASE}/admin/ratings/${ratingId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating: editData.rating,
          comment: editData.comment,
          categories: editData.categories,
          reviewNotes: editData.adminReviewNotes,
        }),
      })

      const text = await response.text()
      console.log('Raw response:', text)
      
      let responseData
      try {
        responseData = JSON.parse(text)
      } catch (e) {
        console.error('Failed to parse JSON:', e)
        throw new Error('Invalid response from server')
      }
      
      if (!response.ok) {
        throw new Error(responseData.message || 'Failed to update rating')
      }

      toast.show('Rating updated successfully', 'success')
      setEditingRating(null)
      setEditData(null)
      fetchRatings()
    } catch (error) {
      console.error('Update error:', error)
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  // Delete rating
  const handleDeleteRating = async (ratingId: string) => {
    if (!window.confirm('Are you sure you want to delete this rating?')) return
    if (!adminToken) return

    try {
      const response = await fetch(`${API_BASE}/admin/ratings/${ratingId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) throw new Error('Failed to delete rating')

      toast.show('Rating deleted successfully', 'success')
      fetchRatings()
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  const renderStars = (value: number) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            size={16}
            className={i < value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
          />
        ))}
      </div>
    )
  }

  // Group ratings by mentor
  const mentorGroups = ratings.reduce((acc: any, rating) => {
    const mentorId = rating.mentor._id
    if (!acc[mentorId]) {
      acc[mentorId] = {
        mentor: rating.mentor,
        ratings: [],
      }
    }
    acc[mentorId].ratings.push(rating)
    return acc
  }, {})

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Ratings Management</h1>
        <p className="text-gray-600 dark:text-gray-400">View, edit, and manage all developer ratings</p>
      </div>

      {/* Controls */}
      <div className="mb-6">
        <button
          onClick={() => fetchRatings()}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Developers List - Grouped by Mentor */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading ratings...</div>
        ) : Object.keys(mentorGroups).length === 0 ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">No ratings found</div>
        ) : (
          Object.values(mentorGroups).map((group: any) => {
            const avgRating = group.ratings.length > 0 
              ? (group.ratings.reduce((sum: number, r: Rating) => sum + r.rating, 0) / group.ratings.length).toFixed(1)
              : 'N/A'
            
            return (
              <div
                key={group.mentor._id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Developer/Mentor Summary Card */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30"
                  onClick={() =>
                    setExpandedMentor(
                      expandedMentor === group.mentor._id ? null : group.mentor._id
                    )
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {group.mentor.firstName} {group.mentor.lastName}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {group.mentor.email}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-2">
                          {renderStars(Math.round(parseFloat(avgRating as string) || 0))}
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {avgRating}
                          </span>
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {group.ratings.length} {group.ratings.length === 1 ? 'rating' : 'ratings'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {expandedMentor === group.mentor._id ? 
                        <ChevronUp size={24} className="text-gray-400" /> : 
                        <ChevronDown size={24} className="text-gray-400" />
                      }
                    </div>
                  </div>
                </div>

                {/* Individual Ratings - Expanded View */}
                {expandedMentor === group.mentor._id && (
                  <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                    {group.ratings.map((rating: Rating) => (
                      <div key={rating._id} className="p-4 space-y-3">
                        {/* Rating Header with Reviewer Info */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {renderStars(rating.rating)}
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {rating.createdAt ? new Date(rating.createdAt).toLocaleDateString() : 'Unknown date'}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                              {rating.reviewer.firstName} {rating.reviewer.lastName}
                            </p>
                            {rating.comment && (
                              <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                                "{rating.comment}"
                              </p>
                            )}
                            {rating.isModifiedByAdmin && (
                              <div className="flex items-center gap-2 mt-2 text-yellow-600 dark:text-yellow-400 text-xs">
                                <AlertCircle size={14} />
                                <span>Modified by admin</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingRating(
                                  editingRating === rating._id ? null : rating._id
                                )
                                if (editingRating !== rating._id) {
                                  setEditData({ ...rating })
                                }
                              }}
                              className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 rounded-lg transition-colors"
                              title="Edit rating"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteRating(rating._id)
                              }}
                              className="p-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 rounded-lg transition-colors"
                              title="Delete rating"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        {/* Edit Form */}
                        {editingRating === rating._id && editData ? (
                          <div className="bg-gray-50 dark:bg-gray-750 p-4 rounded-lg space-y-4 mt-4">
                            {/* Rating Stars Editor */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Rating
                              </label>
                              <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    onClick={() =>
                                      setEditData({ ...editData, rating: star })
                                    }
                                    className="p-1 transition-colors hover:scale-110"
                                  >
                                    <Star
                                      size={24}
                                      className={
                                        star <= (editData.rating || 0)
                                          ? 'fill-yellow-400 text-yellow-400'
                                          : 'text-gray-300'
                                      }
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Comment Editor */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Comment
                              </label>
                              <textarea
                                value={editData.comment || ''}
                                onChange={(e) =>
                                  setEditData({ ...editData, comment: e.target.value })
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                                rows={3}
                                placeholder="Rating comment"
                              />
                            </div>

                            {/* Admin Notes */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Admin Review Notes
                              </label>
                              <textarea
                                value={editData.adminReviewNotes || ''}
                                onChange={(e) =>
                                  setEditData({
                                    ...editData,
                                    adminReviewNotes: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                                rows={2}
                                placeholder="Internal admin notes (not visible to users)"
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateRating(rating._id)}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                              >
                                <Save size={18} />
                                Save Changes
                              </button>
                              <button
                                onClick={() => {
                                  setEditingRating(null)
                                  setEditData(null)
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors"
                              >
                                <X size={18} />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

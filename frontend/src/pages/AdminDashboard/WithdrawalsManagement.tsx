import React, { useState, useEffect } from 'react'
import { DollarSign, CheckCircle, XCircle, Clock, AlertCircle, Save, X, ChevronUp, ChevronDown, Wallet } from 'lucide-react'
import { useToast } from '../../components/UX/ToastProvider'

interface Withdrawal {
  _id: string
  amount: number // in cents
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected'
  mentor: {
    _id: string
    firstName: string
    lastName: string
    email: string
  }
  bankDetails: {
    accountHolderName: string
    bankName: string
    accountNumber: string
  }
  transactionId?: string
  failureReason?: string
  notes?: string
  requestedAt: string
  processedAt?: string
  completedAt?: string
  createdAt: string
}

export default function WithdrawalsManagement() {
  const toast = useToast()
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
  const adminToken = typeof window !== 'undefined' ? (localStorage.getItem('devlink_admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('ADMIN_TOKEN')) : null

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<{ [key: string]: string }>({})
  const [transactionIds, setTransactionIds] = useState<{ [key: string]: string }>({})
  
  // Admin withdrawal form state
  const [adminBalance, setAdminBalance] = useState(0)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false)

  // Fetch withdrawals
  const fetchWithdrawals = async () => {
    if (!adminToken) {
      toast.show('Admin token required', 'error')
      return
    }

    setLoading(true)
    try {
      const url = new URL(`${API_BASE}/admin/withdrawals`, window.location.origin)
      if (statusFilter !== 'all') {
        url.searchParams.append('status', statusFilter)
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) throw new Error('Failed to fetch withdrawals')

      const data = await response.json()
      setWithdrawals(data.data.withdrawals)
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
      console.error('Fetch withdrawals error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWithdrawals()
    fetchAdminBalance()
  }, [statusFilter])

  // Fetch admin's available balance
  const fetchAdminBalance = async () => {
    if (!adminToken) return

    try {
      const response = await fetch(`${API_BASE}/withdrawals/balance`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setAdminBalance(data.data.balance || 0)
      }
    } catch (error) {
      console.error('Error fetching admin balance:', error)
    }
  }

  // Submit admin withdrawal request
  const handleAdminWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!adminToken) {
      toast.show('Admin token required', 'error')
      return
    }

    const amount = parseFloat(withdrawalAmount)
    if (!amount || amount <= 0) {
      toast.show('Enter a valid amount', 'error')
      return
    }

    if (!bankName || !accountHolder || !accountNumber) {
      toast.show('Fill in all bank details', 'error')
      return
    }

    setSubmittingWithdrawal(true)
    try {
      const response = await fetch(`${API_BASE}/withdrawals/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Convert to cents
          bankDetails: {
            accountHolderName: accountHolder,
            bankName: bankName,
            accountNumber: accountNumber,
          },
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || 'Failed to submit withdrawal')
      }

      toast.show('Withdrawal request submitted successfully', 'success')
      setWithdrawalAmount('')
      setBankName('')
      setAccountHolder('')
      setAccountNumber('')
      fetchAdminBalance()
      fetchWithdrawals()
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setSubmittingWithdrawal(false)
    }
  }

  // Approve withdrawal
  const handleApprove = async (withdrawalId: string) => {
    if (!adminToken) {
      toast.show('Admin token required', 'error')
      return
    }

    setActionInProgress(withdrawalId)
    try {
      const response = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: editingNotes[withdrawalId] || '',
        }),
      })

      if (!response.ok) throw new Error('Failed to approve withdrawal')

      const data = await response.json()
      setWithdrawals(withdrawals.map(w => w._id === withdrawalId ? data.data.withdrawal : w))
      setEditingNotes({ ...editingNotes, [withdrawalId]: '' })
      toast.show('Withdrawal approved successfully', 'success')
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  // Reject withdrawal
  const handleReject = async (withdrawalId: string) => {
    if (!adminToken) {
      toast.show('Admin token required', 'error')
      return
    }

    const reason = prompt('Enter reason for rejection:')
    if (!reason) return

    setActionInProgress(withdrawalId)
    try {
      const response = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}/reject`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          failureReason: reason,
        }),
      })

      if (!response.ok) throw new Error('Failed to reject withdrawal')

      const data = await response.json()
      setWithdrawals(withdrawals.map(w => w._id === withdrawalId ? data.data.withdrawal : w))
      toast.show('Withdrawal rejected successfully', 'success')
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  // Mark as completed
  const handleComplete = async (withdrawalId: string) => {
    if (!adminToken) {
      toast.show('Admin token required', 'error')
      return
    }

    setActionInProgress(withdrawalId)
    try {
      const response = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}/complete`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: transactionIds[withdrawalId] || '',
        }),
      })

      if (!response.ok) throw new Error('Failed to complete withdrawal')

      const data = await response.json()
      setWithdrawals(withdrawals.map(w => w._id === withdrawalId ? data.data.withdrawal : w))
      setTransactionIds({ ...transactionIds, [withdrawalId]: '' })
      toast.show('Withdrawal completed successfully', 'success')
    } catch (error) {
      toast.show(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
      processing: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
      completed: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
      failed: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    const Icon = config.icon

    return (
      <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${config.bg} ${config.text} text-sm font-medium`}>
        <Icon className="w-4 h-4" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    )
  }

  const filteredWithdrawals = statusFilter === 'all' 
    ? withdrawals 
    : withdrawals.filter(w => w.status === statusFilter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="w-8 h-8 text-green-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Withdrawals Management</h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Manage withdrawals for mentors and admin earnings</p>
      </div>

      {/* Admin Withdrawal Request Card */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Admin Earnings Withdrawal</h2>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Available Balance (15% Commission)</p>
          <p className="text-3xl font-bold text-green-600">${(adminBalance / 100).toFixed(2)}</p>
        </div>

        <form onSubmit={handleAdminWithdrawal} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Withdrawal Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., BankName"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account Holder Name
              </label>
              <input
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Your Name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account Number
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="1234567890"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submittingWithdrawal || !withdrawalAmount}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            {submittingWithdrawal ? 'Submitting...' : 'Submit Withdrawal Request'}
          </button>
        </form>
      </div>

      {/* Status Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Filter by Status</h2>
        <div className="flex flex-wrap gap-2">
          {['all', 'pending', 'processing', 'completed', 'rejected', 'failed'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                statusFilter === status
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Withdrawals List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Withdrawals ({filteredWithdrawals.length})
        </h2>

        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading...</p>
        ) : filteredWithdrawals.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No withdrawals found</p>
        ) : (
          <div className="space-y-3">
            {filteredWithdrawals.map(withdrawal => (
              <div
                key={withdrawal._id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Summary */}
                <button
                  onClick={() => setExpandedId(expandedId === withdrawal._id ? null : withdrawal._id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all"
                >
                  <div className="flex items-center gap-4 flex-1 text-left">
                    <DollarSign className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        ${(withdrawal.amount / 100).toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {withdrawal.mentor.firstName} {withdrawal.mentor.lastName} ({withdrawal.mentor.email})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(withdrawal.status)}
                    {expandedId === withdrawal._id ? (
                      <ChevronUp className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {expandedId === withdrawal._id && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {/* Bank Details */}
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Bank Details</h4>
                      <div className="bg-white dark:bg-gray-800 rounded p-3 space-y-2 text-sm">
                        <p>
                          <span className="text-gray-600 dark:text-gray-400">Account Holder:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">
                            {withdrawal.bankDetails.accountHolderName}
                          </span>
                        </p>
                        <p>
                          <span className="text-gray-600 dark:text-gray-400">Bank:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">
                            {withdrawal.bankDetails.bankName}
                          </span>
                        </p>
                        <p>
                          <span className="text-gray-600 dark:text-gray-400">Account:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">
                            ****{withdrawal.bankDetails.accountNumber.slice(-4)}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">Requested</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {new Date(withdrawal.requestedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {withdrawal.processedAt && (
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">Processed</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {new Date(withdrawal.processedAt).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {withdrawal.completedAt && (
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">Completed</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {new Date(withdrawal.completedAt).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Notes for pending */}
                    {withdrawal.status === 'pending' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Admin Notes (optional)
                        </label>
                        <textarea
                          value={editingNotes[withdrawal._id] || ''}
                          onChange={(e) => setEditingNotes({ ...editingNotes, [withdrawal._id]: e.target.value })}
                          placeholder="Add notes before approving..."
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          rows={2}
                        />
                      </div>
                    )}

                    {/* Transaction ID for processing */}
                    {withdrawal.status === 'processing' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Transaction ID (optional)
                        </label>
                        <input
                          type="text"
                          value={transactionIds[withdrawal._id] || ''}
                          onChange={(e) => setTransactionIds({ ...transactionIds, [withdrawal._id]: e.target.value })}
                          placeholder="Enter transaction ID..."
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    )}

                    {/* Failure reason for rejected */}
                    {(withdrawal.status === 'rejected' || withdrawal.status === 'failed') && withdrawal.failureReason && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Failure Reason</p>
                        <p className="text-sm text-red-600 dark:text-red-400">{withdrawal.failureReason}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {withdrawal.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(withdrawal._id)}
                          disabled={actionInProgress === withdrawal._id}
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(withdrawal._id)}
                          disabled={actionInProgress === withdrawal._id}
                          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    )}

                    {withdrawal.status === 'processing' && (
                      <button
                        onClick={() => handleComplete(withdrawal._id)}
                        disabled={actionInProgress === withdrawal._id}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Mark as Completed
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

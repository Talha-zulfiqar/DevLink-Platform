import React, { useState, useEffect } from 'react'
import { DollarSign, Wallet, CreditCard, ArrowUp, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { useToast } from '../UX/ToastProvider'

type Withdrawal = {
  _id: string
  amount: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected'
  bankDetails: { accountHolderName: string; bankName: string }
  requestedAt: string
  completedAt?: string
  failureReason?: string
}

type Earnings = {
  totalEarnings: number
  totalWithdrawn: number
  availableBalance: number
}

export default function EarningsAndWithdrawals({ API_BASE }: { API_BASE: string }) {
  const toast = useToast()
  const [earnings, setEarnings] = useState<Earnings | null>(null)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchWithdrawals()
  }, [])

  const fetchWithdrawals = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('devlink_token')
      const res = await fetch(`${API_BASE}/withdrawals/my`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json()
      if (j.success && j.data) {
        setEarnings(j.data.earnings)
        setWithdrawals(j.data.withdrawals)
      }
    } catch (e) {
      console.warn('Failed to fetch withdrawals', e)
      toast.show('Failed to load earnings data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestWithdrawal = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) < 10) {
      toast.show('Minimum withdrawal is $10', 'error')
      return
    }

    if (!bankDetails.accountHolderName || !bankDetails.bankName || !bankDetails.accountNumber) {
      toast.show('Please fill in all bank details', 'error')
      return
    }

    setSubmitting(true)
    try {
      const token = localStorage.getItem('devlink_token')
      const res = await fetch(`${API_BASE}/withdrawals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: parseFloat(withdrawalAmount),
          bankDetails,
        }),
      })

      const j = await res.json()
      if (!res.ok || !j.success) {
        throw new Error(j.message || 'Failed to request withdrawal')
      }

      toast.show('Withdrawal request submitted!', 'success')
      setShowWithdrawalForm(false)
      setWithdrawalAmount('')
      setBankDetails({ accountHolderName: '', bankName: '', accountNumber: '' })
      fetchWithdrawals()
    } catch (err: any) {
      toast.show('Error: ' + (err?.message || String(err)), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500" />
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />
      case 'failed':
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return null
    }
  }

  // Calculate pending withdrawal amount
  const pendingAmount = withdrawals
    .filter(w => w.status === 'pending')
    .reduce((sum, w) => sum + w.amount, 0)

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading earnings...</div>
  }

  return (
    <div className="space-y-6">
      {/* Earnings Summary Cards */}
      {earnings && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border border-green-200 dark:border-green-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Total Earnings</p>
                <p className="text-3xl font-bold text-green-900 dark:text-green-100">${earnings.totalEarnings.toFixed(2)}</p>
              </div>
              <DollarSign className="w-12 h-12 text-green-400 opacity-20" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Available Balance</p>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">${earnings.availableBalance.toFixed(2)}</p>
                {pendingAmount > 0 && (
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                    ${(pendingAmount / 100).toFixed(2)} pending approval
                  </p>
                )}
              </div>
              <Wallet className="w-12 h-12 text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-6 border border-purple-200 dark:border-purple-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700 dark:text-purple-400 mb-1">Total Withdrawn</p>
                <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">${earnings.totalWithdrawn.toFixed(2)}</p>
              </div>
              <ArrowUp className="w-12 h-12 text-purple-400 opacity-20" />
            </div>
          </div>
        </div>
      )}

      {/* Pending Withdrawals Alert */}
      {pendingAmount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-900 dark:text-yellow-100">Pending Withdrawal</h4>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
              You have ${(pendingAmount / 100).toFixed(2)} in pending withdrawal requests awaiting admin approval. This amount is reserved and not available for new requests.
            </p>
          </div>
        </div>
      )}

      {/* Request Withdrawal */}
      {!showWithdrawalForm ? (
        <button
          onClick={() => setShowWithdrawalForm(true)}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold py-3 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all flex items-center justify-center gap-2"
        >
          <ArrowUp className="w-5 h-5" />
          Request Cash Withdrawal
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Request Withdrawal</h3>

          <div className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount (USD)</label>
              <input
                type="number"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                placeholder="Enter amount (minimum $10)"
                min="10"
                step="0.01"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
              {earnings && <p className="text-xs text-gray-500 mt-1">Available: ${earnings.availableBalance.toFixed(2)}</p>}
            </div>

            {/* Bank Details */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Account Holder Name</label>
              <input
                type="text"
                value={bankDetails.accountHolderName}
                onChange={(e) => setBankDetails({ ...bankDetails, accountHolderName: e.target.value })}
                placeholder="Full name"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bank Name</label>
              <input
                type="text"
                value={bankDetails.bankName}
                onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                placeholder="e.g., Chase, Bank of America"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Account Number</label>
              <input
                type="password"
                value={bankDetails.accountNumber}
                onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                placeholder="Your account number (encrypted)"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRequestWithdrawal}
                disabled={submitting}
                className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all"
              >
                {submitting ? 'Processing...' : 'Request Withdrawal'}
              </button>
              <button
                onClick={() => setShowWithdrawalForm(false)}
                className="flex-1 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5" /> Withdrawal History
        </h3>

        {withdrawals.length === 0 ? (
          <p className="text-center text-gray-500 py-6">No withdrawals yet</p>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div key={w._id} className="flex items-center justify-between p-4 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="flex items-center gap-3 flex-1">
                  {getStatusIcon(w.status)}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">${(w.amount / 100).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{w.bankDetails.bankName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{w.status}</p>
                  <p className="text-xs text-gray-500">{new Date(w.requestedAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

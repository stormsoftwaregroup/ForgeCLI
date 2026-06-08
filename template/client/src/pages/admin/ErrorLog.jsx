import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Trash2,
} from 'lucide-react';
import * as adminService from '../../services/adminService';

const SEVERITY_STYLES = {
  ERROR: 'bg-red-100 text-red-700',
  WARN: 'bg-yellow-100 text-yellow-800',
  INFO: 'bg-blue-100 text-blue-700',
};

SeverityBadge.propTypes = {
  severity: PropTypes.string.isRequired,
};

function SeverityBadge({ severity }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[severity] || 'bg-gray-100 text-gray-600'}`}
    >
      {severity}
    </span>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function truncate(str, len = 80) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

export default function ErrorLog() {
  const [errors, setErrors] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [severity, setSeverity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Cleanup state
  const [cleanupResult, setCleanupResult] = useState(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (severity) params.severity = severity;
      if (startDate) params.startDate = new Date(startDate).toISOString();
      if (endDate) params.endDate = new Date(endDate + 'T23:59:59').toISOString();

      const data = await adminService.getErrors(params);
      setErrors(data.errors);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, [page, severity, startDate, endDate]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  async function handleRowClick(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }

    setExpandedId(id);
    setDetailLoading(true);
    try {
      const data = await adminService.getErrorById(id);
      setExpandedDetail(data.error);
    } catch {
      setExpandedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCleanup() {
    if (!window.confirm('Delete all error logs older than 30 days?')) return;
    try {
      const data = await adminService.cleanupErrors();
      setCleanupResult(data);
      fetchErrors();
      setTimeout(() => setCleanupResult(null), 5000);
    } catch {
      setCleanupResult({ message: 'Cleanup failed' });
      setTimeout(() => setCleanupResult(null), 5000);
    }
  }

  function handleFilterReset() {
    setSeverity('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [severity, startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Error Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            System errors captured by the server logging pipeline.
          </p>
        </div>
        <button
          onClick={handleCleanup}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          Clean up old errors
        </button>
      </div>

      {/* Cleanup result toast */}
      {cleanupResult && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {cleanupResult.message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label htmlFor="filter-severity" className="mb-1 block text-xs font-medium text-gray-500">
            Severity
          </label>
          <select
            id="filter-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            <option value="">All</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="filter-start-date"
            className="mb-1 block text-xs font-medium text-gray-500"
          >
            Start Date
          </label>
          <input
            id="filter-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </div>
        <div>
          <label htmlFor="filter-end-date" className="mb-1 block text-xs font-medium text-gray-500">
            End Date
          </label>
          <input
            id="filter-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </div>
        {(severity || startDate || endDate) && (
          <button
            onClick={handleFilterReset}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Severity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Message
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  URL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-300" />
                  </td>
                </tr>
              ) : errors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <CheckCircle className="h-10 w-10 text-green-300" />
                      <p className="mt-3 text-sm font-medium text-gray-500">No errors found</p>
                      <p className="mt-1 text-xs text-gray-400">
                        The system is running smoothly. Nothing to report.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                errors.map((err) => (
                  <ErrorRow
                    key={err.id}
                    error={err}
                    isExpanded={expandedId === err.id}
                    detail={expandedId === err.id ? expandedDetail : null}
                    detailLoading={expandedId === err.id && detailLoading}
                    onToggle={() => handleRowClick(err.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && errors.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

ErrorRow.propTypes = {
  error: PropTypes.shape({
    id: PropTypes.number.isRequired,
    createdAt: PropTypes.string.isRequired,
    severity: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    method: PropTypes.string,
    url: PropTypes.string,
  }).isRequired,
  isExpanded: PropTypes.bool.isRequired,
  detail: PropTypes.object,
  detailLoading: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

function ErrorRow({ error, isExpanded, detail, detailLoading, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-3 text-gray-400">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
          {formatDate(error.createdAt)}
        </td>
        <td className="px-4 py-3">
          <SeverityBadge severity={error.severity} />
        </td>
        <td className="max-w-xs px-4 py-3 text-sm text-gray-700">{truncate(error.message)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-500">
          {error.method || '—'}
        </td>
        <td className="max-w-xs px-4 py-3 text-sm text-gray-500">{truncate(error.url, 60)}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="border-t border-gray-100 bg-gray-50 px-6 py-4">
            {detailLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : detail ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400">ID</p>
                    <p className="text-gray-700">{detail.id}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400">User ID</p>
                    <p className="text-gray-700">{detail.userId ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400">Method</p>
                    <p className="font-mono text-gray-700">{detail.method || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400">URL</p>
                    <p className="break-all text-gray-700">{detail.url || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400">Message</p>
                  <p className="mt-1 text-sm text-gray-700">{detail.message}</p>
                </div>
                {detail.stack && (
                  <div>
                    <p className="text-xs font-medium text-gray-400">Stack Trace</p>
                    <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-400">
                      {detail.stack}
                    </pre>
                  </div>
                )}
                {detail.body && (
                  <div>
                    <p className="text-xs font-medium text-gray-400">Request Body</p>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-300">
                      {detail.body}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Failed to load details.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

import PropTypes from 'prop-types';
import { Activity, Hash } from 'lucide-react';
import useAuthStore from '../stores/authStore';

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
};

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
          <Icon className="h-5 w-5 text-gray-600" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.firstName}</h1>
        <p className="mt-1 text-sm text-gray-500">Here&apos;s an overview of your workspace.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Items" value="0" icon={Hash} />
        <StatCard label="Recent Activity" value="—" icon={Activity} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <div className="mt-4 flex flex-col items-center py-8 text-center">
          <Activity className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            No recent activity yet. This area will populate as you use the application.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { cn } from '../../utils/helpers';

const pageTitles = {
  '/coordinator/dashboard': 'Dashboard',
  '/coordinator/students': 'Student Management',
  '/coordinator/mentors': 'Mentor Management',
  '/coordinator/teams': 'Team Management',
  '/coordinator/analytics': 'Analytics',
  '/student/dashboard': 'Dashboard',
  '/student/team': 'My Team',
  '/student/projects': 'Project Listings',
  '/student/tasks': 'Tasks',
  '/student/milestones': 'Milestones',
  '/student/feedback': 'Feedback',
  '/mentor/dashboard': 'Dashboard',
  '/mentor/evaluations': 'Evaluations',
  '/mentor/risks': 'Risk Alerts',
  '/settings': 'Settings',
};

export default function PageWrapper({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const title = pageTitles[location.pathname] || 'CollabCore';

  return (
    <div className="min-h-screen bg-surface-bg dark:bg-dark-bg">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          'transition-all duration-300',
          collapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        <Navbar title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProtectedRoute, PageWrapper } from './components/layout';
import LoginPage from './pages/auth/LoginPage';
import StudentProfileSetup from './pages/auth/StudentProfileSetup';

// Coordinator Pages
import CoordinatorDashboardPage from './pages/coordinator/DashboardPage';
import CoordinatorStudentsPage from './pages/coordinator/StudentsPage';
import CoordinatorMentorsPage from './pages/coordinator/MentorsPage';
import CoordinatorTeamsPage from './pages/coordinator/TeamsPage';
import CoordinatorAnalyticsPage from './pages/coordinator/AnalyticsPage';

// Student Pages
import StudentDashboardPage from './pages/student/DashboardPage';
import StudentTeamPage from './pages/student/TeamPage';
import StudentProjectsPage from './pages/student/ProjectsPage';
import StudentTasksPage from './pages/student/TasksPage';
import StudentMilestonesPage from './pages/student/MilestonesPage';
import StudentFeedbackPage from './pages/student/FeedbackPage';

// Mentor Pages
import MentorDashboardPage from './pages/mentor/DashboardPage';
import MentorTeamDetailsPage from './pages/mentor/TeamDetailsPage';
import MentorEvaluationsPage from './pages/mentor/EvaluationsPage';
import MentorRisksPage from './pages/mentor/RisksPage';
import SettingsPage from './pages/shared/SettingsPage';

/* Placeholder page component */
function PlaceholderPage({ name }) {
  return (
    <PageWrapper>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text-primary dark:text-text-inverted mb-2">
            {name}
          </h2>
          <p className="text-text-secondary dark:text-text-muted">Coming Soon</p>
        </div>
      </div>
    </PageWrapper>
  );
}

function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg dark:bg-dark-bg">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-danger mb-2">403</h1>
        <h2 className="text-xl font-semibold text-text-primary dark:text-text-inverted mb-2">
          Unauthorized Access
        </h2>
        <p className="text-text-secondary dark:text-text-muted mb-4">
          You don't have permission to access this page.
        </p>
        <a href="/login" className="text-primary dark:text-dark-primaryAccent hover:underline">
          Go to Login
        </a>
      </div>
    </div>
  );
}

function RoleRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const roleHome = {
    coordinator: '/coordinator/dashboard',
    student: '/student/dashboard',
    mentor: '/mentor/dashboard',
  };
  return <Navigate to={roleHome[user?.role] || '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup-profile" element={<StudentProfileSetup />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route element={<ProtectedRoute allowedRoles={['coordinator', 'student', 'mentor']} />}>
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Coordinator Routes */}
      <Route element={<ProtectedRoute allowedRoles={['coordinator']} />}>
        <Route path="/coordinator/dashboard" element={<CoordinatorDashboardPage />} />
        <Route path="/coordinator/students" element={<CoordinatorStudentsPage />} />
        <Route path="/coordinator/mentors" element={<CoordinatorMentorsPage />} />
        <Route path="/coordinator/teams" element={<CoordinatorTeamsPage />} />
        <Route path="/coordinator/analytics" element={<CoordinatorAnalyticsPage />} />
      </Route>

      {/* Student Routes */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student/dashboard" element={<StudentDashboardPage />} />
        <Route path="/student/team" element={<StudentTeamPage />} />
        <Route path="/student/projects" element={<StudentProjectsPage />} />
        <Route path="/student/tasks" element={<StudentTasksPage />} />
        <Route path="/student/milestones" element={<StudentMilestonesPage />} />
        <Route path="/student/feedback" element={<StudentFeedbackPage />} />
      </Route>

      {/* Mentor Routes */}
      <Route element={<ProtectedRoute allowedRoles={['mentor']} />}>
        <Route path="/mentor/dashboard" element={<MentorDashboardPage />} />
        <Route path="/mentor/teams/:id" element={<MentorTeamDetailsPage />} />
        <Route path="/mentor/evaluations" element={<MentorEvaluationsPage />} />
        <Route path="/mentor/risks" element={<MentorRisksPage />} />
      </Route>

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

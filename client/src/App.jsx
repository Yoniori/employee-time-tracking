import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLogin from './pages/EmployeeLogin';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeSignup from './pages/EmployeeSignup';
import ManagerLogin from './pages/ManagerLogin';
import ManagerDashboard from './pages/ManagerDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { useInactivityLogout } from './hooks/useInactivityLogout';
import InactivityWarning from './components/InactivityWarning';

function EmployeeRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function ManagerRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <LoadingScreen />;
  if (!user) return <Navigate to="/manager/login" replace />;
  return children;
}

// Sits as a sibling of <Routes> so its state survives route navigation.
// After signOut the route guard redirects to the login page; this component
// renders the "session expired" overlay on top of that page.
// It never modifies attendance records.
function InactivityGuard() {
  const { showWarning, sessionExpired, dismissWarning, dismissExpired } =
    useInactivityLogout();
  return (
    <InactivityWarning
      showWarning={showWarning}
      sessionExpired={sessionExpired}
      onDismissWarning={dismissWarning}
      onDismissExpired={dismissExpired}
    />
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">טוען...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <InactivityGuard />
        <Routes>
          <Route path="/" element={<EmployeeLogin />} />
          <Route path="/signup" element={<EmployeeSignup />} />
          <Route path="/dashboard" element={
            <EmployeeRoute>
              <ErrorBoundary><EmployeeDashboard /></ErrorBoundary>
            </EmployeeRoute>
          } />
          <Route path="/manager/login" element={<ManagerLogin />} />
          <Route path="/manager" element={
            <ManagerRoute>
              <ErrorBoundary><ManagerDashboard /></ErrorBoundary>
            </ManagerRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

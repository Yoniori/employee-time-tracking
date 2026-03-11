import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLogin from './pages/EmployeeLogin';
import EmployeeDashboard from './pages/EmployeeDashboard';
import ManagerLogin from './pages/ManagerLogin';
import ManagerDashboard from './pages/ManagerDashboard';

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
        <Routes>
          <Route path="/" element={<EmployeeLogin />} />
          <Route path="/dashboard" element={
            <EmployeeRoute><EmployeeDashboard /></EmployeeRoute>
          } />
          <Route path="/manager/login" element={<ManagerLogin />} />
          <Route path="/manager" element={
            <ManagerRoute><ManagerDashboard /></ManagerRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

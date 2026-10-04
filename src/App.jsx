import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const location = useLocation();

  return (
    <div className="bg-[#f7f6f2] dark:bg-[#0a0a0a] min-h-screen text-gray-900 dark:text-white font-sans transition-colors duration-200">
      <AnimatePresence mode="popLayout">
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center" role="status">Loading page…</div>}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/courses/:id/students" 
            element={
              <ProtectedRoute>
                <StudentsPage />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/courses/:id/attendance" 
            element={
              <ProtectedRoute>
                <AttendancePage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/courses/:id/history" 
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            } 
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </AnimatePresence>
    </div>
  );
}

export default App;

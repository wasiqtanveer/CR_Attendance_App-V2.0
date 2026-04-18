import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import AttendancePage from './pages/AttendancePage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import CustomCursor from './components/CustomCursor';

function App() {
  const location = useLocation();

  return (
    <div className="bg-[#f7f6f2] dark:bg-[#0a0a0a] min-h-screen text-gray-900 dark:text-white font-sans transition-colors duration-200">
      <CustomCursor />
      <AnimatePresence mode="wait">
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
      </AnimatePresence>
    </div>
  );
}

export default App;

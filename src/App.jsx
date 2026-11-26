// src/App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { getEffectivePermissions } from './utils/adminPermissions';
import Loading from './components/Loading';

// ── Auth Pages ──
const Login    = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

// ── Public Pages ──
const PublicLayout = lazy(() => import('./pages/public/PublicLayout'));
const Home         = lazy(() => import('./pages/public/Home'));
const HowItWorks   = lazy(() => import('./pages/public/HowItWorks'));
const About        = lazy(() => import('./pages/public/About'));
const Contact      = lazy(() => import('./pages/public/Contact'));
const Pricing      = lazy(() => import('./pages/public/Pricing'));

// ── Dashboard Pages ──
const Layout           = lazy(() => import('./components/Layout'));
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Syllabus         = lazy(() => import('./pages/Syllabus'));
const AdminItems       = lazy(() => import('./pages/AdminItems'));
const Progress         = lazy(() => import('./pages/Progress'));
const Quizzes          = lazy(() => import('./pages/Quizzes'));
const AdminApprovals   = lazy(() => import('./pages/AdminApprovals'));
const AdminManage      = lazy(() => import('./pages/AdminManage'));
const AdminStudents    = lazy(() => import('./pages/AdminStudents'));
const CategoryDetails  = lazy(() => import('./pages/CategoryDetails'));
const ItemDetail       = lazy(() => import('./pages/ItemDetail'));
const AdminItemLayout  = lazy(() => import('./pages/AdminItemLayout'));
const AdminValidations = lazy(() => import('./pages/AdminValidations'));
const Settings         = lazy(() => import('./pages/Settings'));
const Rewards          = lazy(() => import('./pages/Rewards'));
const AIAgent          = lazy(() => import('./pages/AIAgent'));
const Chat             = lazy(() => import('./pages/Chat'));
const Competition      = lazy(() => import('./pages/Competition'));

function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}

function PermissionRoute({ permission, children }) {
  const { userData } = useAuth();
  if (!userData) return null;
  if (userData.role !== 'admin') return <Navigate to="/dashboard" replace />;
  const perms = getEffectivePermissions(userData);
  if (perms[permission] !== true) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { currentUser } = useAuth();

  return (
    <Router>
      {/* ★ The Suspense fallback shows our new Samurai Loading animation while a page loads */}
      <Suspense fallback={<Loading variant="full" size="lg" />}>
        <Routes>
          {/* ── Public Website ── */}
          <Route path="/" element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="prices" element={<Pricing />} />
          </Route>

          {/* ── Auth ── */}
          <Route path="/login" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
          <Route path="/register" element={currentUser ? <Navigate to="/dashboard" /> : <Register />} />

          {/* ── Internal App ── */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="syllabus" element={<Syllabus />} />
            <Route path="syllabus/:categoryId" element={<CategoryDetails />} />
            <Route path="syllabus/:categoryId/:itemId" element={<ItemDetail />} />
            <Route path="progress" element={<Progress />} />
            <Route path="quizzes" element={<Quizzes />} />
            <Route path="rewards" element={<Rewards />} />
            <Route path="competition" element={<Competition />} />
            <Route path="chat" element={<Chat />} />
            <Route path="assistant" element={<AIAgent />} />
            <Route path="settings" element={<Settings />} />

            {/* Admin Routes */}
            <Route path="admin/approvals" element={<PermissionRoute permission="approvals"><AdminApprovals /></PermissionRoute>} />
            <Route path="admin/validations" element={<PermissionRoute permission="validations"><AdminValidations /></PermissionRoute>} />
            <Route path="admin/students" element={<PermissionRoute permission="students"><AdminStudents /></PermissionRoute>} />
            <Route path="admin/manage" element={<PermissionRoute permission="syllabus"><AdminManage /></PermissionRoute>} />
            <Route path="admin/items/:categoryId" element={<PermissionRoute permission="syllabus"><AdminItems /></PermissionRoute>} />
            <Route path="admin/items/:categoryId/:itemId/design" element={<PermissionRoute permission="syllabus"><AdminItemLayout /></PermissionRoute>} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
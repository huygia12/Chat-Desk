import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Channels from "./pages/Channels";
import Products from "./pages/Products";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/AdminDashboard";
import WidgetPage from "./pages/WidgetPage";
import Widgets from "./pages/Widgets";
import Employees from "./pages/Employees";

function PrivateRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) return <Navigate to="/login" />;
  if (user?.role !== "admin") return <Navigate to="/chat" />;

  return children;
}

/** Restrict access to business-only pages (employees can't access) */
function BusinessOnlyRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) return <Navigate to="/login" />;
  if (user?.role === "employee") return <Navigate to="/chat" />;
  if (user?.role === "admin") return <Navigate to="/admin" />;

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Widget Page (Public, no auth required) */}
      <Route path="/widget" element={<WidgetPage />} />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <Layout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
      </Route>

      {/* Business + Employee Routes (shared layout, role-restricted pages inside) */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/chat" />} />
        {/* Chat: accessible by both business and employee */}
        <Route path="chat" element={<Chat />} />
        {/* Business-only pages */}
        <Route
          path="channels"
          element={
            <BusinessOnlyRoute>
              <Channels />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="products"
          element={
            <BusinessOnlyRoute>
              <Products />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="widgets"
          element={
            <BusinessOnlyRoute>
              <Widgets />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="employees"
          element={
            <BusinessOnlyRoute>
              <Employees />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="settings"
          element={
            <BusinessOnlyRoute>
              <Settings />
            </BusinessOnlyRoute>
          }
        />
      </Route>
    </Routes>
  );
}


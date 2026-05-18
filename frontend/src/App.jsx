import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Channels from "./pages/Channels";
import Products from "./pages/Products";
import Settings from "./pages/Settings";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminBusinessDetail from "./pages/AdminBusinessDetail";
import AdminBusinessDirectory from "./pages/AdminBusinessDirectory";
import WidgetPage from "./pages/WidgetPage";
import Employees from "./pages/Employees";
import Labels from "./pages/Labels";
import EmployeeSettings from "./pages/EmployeeSettings";
import SavedReplies from "./pages/SavedReplies";
import AssignmentSettings from "./pages/AssignmentSettings";
import Statistics from "./pages/Statistics";

function PrivateRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [checking, setChecking] = useState(Boolean(token && !user));

  useEffect(() => {
    let alive = true;
    const ensureUser = async () => {
      if (!token || user) {
        setChecking(false);
        return;
      }
      setChecking(true);
      await fetchUser();
      if (alive) setChecking(false);
    };
    ensureUser();
    return () => {
      alive = false;
    };
  }, [fetchUser, token, user]);

  if (!token) return <Navigate to="/login" />;
  if (checking || !user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin />
      </div>
    );
  }
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

function EmployeeOnlyRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) return <Navigate to="/login" />;
  if (user?.role === "admin") return <Navigate to="/admin" />;
  if (user?.role !== "employee") return <Navigate to="/chat" />;

  return children;
}

function BusinessOrEmployeeRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) return <Navigate to="/login" />;
  if (user?.role === "admin") return <Navigate to="/admin" />;
  if (!["business", "employee"].includes(user?.role)) return <Navigate to="/login" />;

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
        <Route index element={<AdminAnalytics />} />
        <Route path="businesses" element={<AdminBusinessDirectory />} />
        <Route path="businesses/:businessId" element={<AdminBusinessDetail />} />
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
        <Route path="widgets" element={<Navigate to="/channels" replace />} />
        <Route
          path="employees"
          element={
            <BusinessOnlyRoute>
              <Employees />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="labels"
          element={
            <BusinessOnlyRoute>
              <Labels />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="saved-replies"
          element={
            <BusinessOrEmployeeRoute>
              <SavedReplies />
            </BusinessOrEmployeeRoute>
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
        <Route
          path="assignment-settings"
          element={
            <BusinessOnlyRoute>
              <AssignmentSettings />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="statistics"
          element={
            <BusinessOnlyRoute>
              <Statistics />
            </BusinessOnlyRoute>
          }
        />
        <Route
          path="employee-settings"
          element={
            <EmployeeOnlyRoute>
              <EmployeeSettings />
            </EmployeeOnlyRoute>
          }
        />
      </Route>
    </Routes>
  );
}

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

      {/* Business Routes */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/chat" />} />
        <Route path="chat" element={<Chat />} />
        <Route path="channels" element={<Channels />} />
        <Route path="products" element={<Products />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

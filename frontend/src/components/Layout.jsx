import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout as AntLayout, Menu, Button, Typography, Tag } from "antd";
import {
  MessageOutlined,
  ApiOutlined,
  ShoppingOutlined,
  SettingOutlined,
  LogoutOutlined,
  DashboardOutlined,
  CodeOutlined,
  TeamOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../store/authStore";
import { useEffect } from "react";
import { connectWebSocket, disconnectWebSocket } from "../utils/websocket";
import { useChatStore } from "../store/chatStore";

const { Header, Sider, Content } = AntLayout;

const businessMenuItems = [
  { key: "/chat", icon: <MessageOutlined />, label: "Tin nhắn" },
  { key: "/channels", icon: <ApiOutlined />, label: "Kênh kết nối" },
  { key: "/products", icon: <ShoppingOutlined />, label: "Sản phẩm" },
  { key: "/widgets", icon: <CodeOutlined />, label: "Widgets" },
  { key: "/labels", icon: <TagsOutlined />, label: "Labels" },
  { key: "/employees", icon: <TeamOutlined />, label: "Nhân viên" },
  { key: "/settings", icon: <SettingOutlined />, label: "Cài đặt" },
];

const employeeMenuItems = [
  { key: "/chat", icon: <MessageOutlined />, label: "Tin nhắn" },
];

const adminMenuItems = [
  { key: "/admin", icon: <DashboardOutlined />, label: "Dashboard" },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const addMessage = useChatStore((s) => s.addMessage);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const isAdmin = user?.role === "admin";
  const isEmployee = user?.role === "employee";
  const isBusiness = user?.role === "business";

  let menuItems = adminMenuItems;
  if (isBusiness) menuItems = businessMenuItems;
  else if (isEmployee) menuItems = employeeMenuItems;

  // WebSocket key: employee uses their business_id, business uses own id
  const wsBusinessId = isEmployee ? user?.business_id : user?.id;

  useEffect(() => {
    if (wsBusinessId && !isAdmin) {
      const ws = connectWebSocket(wsBusinessId, (data) => {
        if (data.type === "new_message") {
          addMessage({
            ...data.message,
            conversation_id: data.conversation_id,
          });
          fetchConversations();
        }
      });
      return () => disconnectWebSocket();
    }
  }, [wsBusinessId, isAdmin]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Display name in header
  const displayName = isEmployee
    ? (user?.full_name || user?.email)
    : isAdmin
    ? "Admin Panel"
    : (user?.business_name || user?.email);

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider theme="light" width={220}>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <Typography.Title level={4} style={{ margin: 0, color: "#1890ff" }}>
            ChatDesk
          </Typography.Title>
          {isAdmin && (
            <Tag color="gold" style={{ marginTop: 8 }}>
              Admin
            </Tag>
          )}
          {isEmployee && (
            <Tag color="blue" style={{ marginTop: 8 }}>
              Nhân viên
            </Tag>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        <div
          style={{
            position: "absolute",
            bottom: 16,
            width: "100%",
            padding: "0 16px",
          }}
        >
          <Button icon={<LogoutOutlined />} onClick={handleLogout} block>
            Đăng xuất
          </Button>
        </div>
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Typography.Text strong>{displayName}</Typography.Text>
        </Header>
        <Content
          style={{
            margin: 0,
            background: "#fff",
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}

import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout as AntLayout, Menu, Button, Typography, Tag, Modal } from "antd";
import {
  MessageOutlined,
  ApiOutlined,
  ShoppingOutlined,
  SettingOutlined,
  LogoutOutlined,
  DashboardOutlined,
  CodeOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../store/authStore";
import { useEffect, useState } from "react";
import { connectWebSocket, disconnectWebSocket } from "../utils/websocket";
import { useChatStore } from "../store/chatStore";

const { Header, Sider, Content } = AntLayout;

const businessMenuItems = [
  { key: "/chat", icon: <MessageOutlined />, label: "Tin nhắn" },
  { key: "/channels", icon: <ApiOutlined />, label: "Kênh kết nối" },
  { key: "/products", icon: <ShoppingOutlined />, label: "Sản phẩm" },
  { key: "/widgets", icon: <CodeOutlined />, label: "Widgets" },
  { key: "/labels", icon: <TagsOutlined />, label: "Labels" },
  { key: "/saved-replies", icon: <FileTextOutlined />, label: "Saved Replies" },
  { key: "/employees", icon: <TeamOutlined />, label: "Nhân viên" },
  { key: "/settings", icon: <SettingOutlined />, label: "Cài đặt" },
];

const employeeMenuItems = [
  { key: "/chat", icon: <MessageOutlined />, label: "Tin nhắn" },
  { key: "/saved-replies", icon: <FileTextOutlined />, label: "Saved Replies" },
  { key: "/employee-settings", icon: <SettingOutlined />, label: "Cài đặt" },
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
  const [collapsed, setCollapsed] = useState(false);

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

  const confirmLogout = () => {
    Modal.confirm({
      title: "Đăng xuất?",
      content: "Bạn có chắc muốn đăng xuất?",
      centered: true,
      okText: "Đồng ý",
      cancelText: "Hủy",
      onOk: handleLogout,
    });
  };

  // Display name in header
  const displayName = isEmployee
    ? (user?.full_name || user?.email)
    : isAdmin
    ? "Admin Panel"
    : (user?.business_name || user?.email);

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider
        theme="light"
        width={220}
        collapsedWidth={64}
        collapsed={collapsed}
        trigger={null}
        style={{ position: "relative" }}
      >
        <Button
          size="small"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed((value) => !value)}
          style={{
            position: "absolute",
            top: 16,
            right: -14,
            zIndex: 10,
            width: 28,
            height: 28,
            borderRadius: 14,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        />
        <div style={{ padding: collapsed ? "16px 8px" : "16px", textAlign: "center" }}>
          <Typography.Title level={collapsed ? 5 : 4} style={{ margin: 0, color: "#1890ff" }}>
            {collapsed ? "CD" : "ChatDesk"}
          </Typography.Title>
          {!collapsed && isAdmin && (
            <Tag color="gold" style={{ marginTop: 8 }}>
              Admin
            </Tag>
          )}
          {!collapsed && isEmployee && (
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
          inlineCollapsed={collapsed}
        />
        <div
          style={{
            position: "absolute",
            bottom: 16,
            width: "100%",
            padding: collapsed ? "0 12px" : "0 16px",
          }}
        >
          {collapsed ? (
            <Button
              icon={<LogoutOutlined />}
              onClick={confirmLogout}
              style={{ width: 40, paddingInline: 0 }}
              aria-label="Đăng xuất"
            />
          ) : (
          <Button
            icon={<LogoutOutlined />}
            onClick={confirmLogout}
            block
            style={{ overflow: "hidden", paddingInline: collapsed ? 0 : undefined }}
          >
            Đăng xuất
          </Button>
          )}
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

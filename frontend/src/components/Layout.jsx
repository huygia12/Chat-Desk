import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout as AntLayout, Button, Menu, Modal, Tag, Tooltip, Typography, theme } from "antd";
import {
  ApiOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MoonOutlined,
  PartitionOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SunOutlined,
  TagsOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useI18n } from "../i18n/useI18n";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useLanguageStore } from "../store/languageStore";
import { useThemeStore } from "../store/themeStore";
import { connectWebSocket, disconnectWebSocket } from "../utils/websocket";
import AIAssistantModal from "./AIAssistantModal";

const { Header, Sider, Content } = AntLayout;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const addMessage = useChatStore((s) => s.addMessage);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const { language, t } = useI18n();
  const toggleLanguage = useLanguageStore((s) => s.toggleLanguage);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = user?.role === "admin";
  const isEmployee = user?.role === "employee";
  const isBusiness = user?.role === "business";

  const businessMenuItems = [
    { key: "/chat", icon: <MessageOutlined />, label: t("nav.chat") },
    { key: "/channels", icon: <ApiOutlined />, label: t("nav.channels") },
    { key: "/products", icon: <ShoppingOutlined />, label: t("nav.products") },
    { key: "/labels", icon: <TagsOutlined />, label: t("nav.labels") },
    { key: "/saved-replies", icon: <FileTextOutlined />, label: t("nav.savedReplies") },
    { key: "/assignment-settings", icon: <PartitionOutlined />, label: t("nav.assignmentSettings") },
    { key: "/statistics", icon: <BarChartOutlined />, label: t("nav.statistics") },
    { key: "/employees", icon: <TeamOutlined />, label: t("nav.employees") },
    { key: "/settings", icon: <SettingOutlined />, label: t("nav.settings") },
  ];

  const employeeMenuItems = [
    { key: "/chat", icon: <MessageOutlined />, label: t("nav.chat") },
    { key: "/saved-replies", icon: <FileTextOutlined />, label: t("nav.savedReplies") },
    { key: "/employee-settings", icon: <SettingOutlined />, label: t("nav.settings") },
  ];

  const adminMenuItems = [
    { key: "/admin", icon: <DashboardOutlined />, label: t("nav.adminAnalytics") },
    { key: "/admin/businesses", icon: <ShopOutlined />, label: t("nav.businessDirectory") },
  ];

  let menuItems = adminMenuItems;
  if (isBusiness) menuItems = businessMenuItems;
  else if (isEmployee) menuItems = employeeMenuItems;
  const selectedMenuKey = isAdmin && location.pathname.startsWith("/admin/businesses")
    ? "/admin/businesses"
    : location.pathname;

  const wsBusinessId = isEmployee ? user?.business_id : user?.id;

  useEffect(() => {
    if (wsBusinessId && !isAdmin) {
      connectWebSocket(wsBusinessId, (data) => {
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
  }, [addMessage, fetchConversations, isAdmin, wsBusinessId]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const confirmLogout = () => {
    Modal.confirm({
      title: t("layout.logoutTitle"),
      content: t("layout.logoutContent"),
      centered: true,
      okText: t("layout.confirm"),
      cancelText: t("layout.cancel"),
      onOk: handleLogout,
    });
  };

  const displayName = isEmployee
    ? user?.full_name || user?.email
    : isAdmin
      ? t("layout.adminPanel")
      : user?.business_name || user?.email;

  return (
    <AntLayout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sider
        theme={themeMode === "dark" ? "dark" : "light"}
        width={220}
        collapsedWidth={64}
        collapsed={collapsed}
        trigger={null}
        style={{ position: "relative", background: token.colorBgContainer }}
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
            boxShadow: token.boxShadowSecondary,
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
              {t("layout.employee")}
            </Tag>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey]}
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
              aria-label={t("layout.logout")}
            />
          ) : (
            <Button icon={<LogoutOutlined />} onClick={confirmLogout} block>
              {t("layout.logout")}
            </Button>
          )}
        </div>
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Typography.Text strong>{displayName}</Typography.Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AIAssistantModal />
            <Tooltip title={t("language.toggleTooltip")}>
              <button
                type="button"
                className={`language-toggle language-toggle-${language}`}
                onClick={toggleLanguage}
                aria-label={t("language.toggleTooltip")}
              >
                <span className="language-toggle__label">{language === "vi" ? "VIE" : "ENG"}</span>
                <span className="language-toggle__knob" />
              </button>
            </Tooltip>
            <Tooltip title={themeMode === "dark" ? t("theme.light") : t("theme.dark")}>
              <Button
                icon={themeMode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>
          </div>
        </Header>
        <Content
          style={{
            margin: 0,
            background: token.colorBgContainer,
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}

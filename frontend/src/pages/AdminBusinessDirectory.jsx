import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message, theme } from "antd";
import { EyeOutlined, ReloadOutlined, SearchOutlined, ShopOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";
import { formatNumber } from "../components/AdminCharts";

const { Title, Text } = Typography;

export default function AdminBusinessDirectory() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/admin/businesses", {
        params: {
          search: search || undefined,
          status,
          sort,
        },
      });
      setItems(res.data.items || []);
    } catch (err) {
      message.error(t("admin.loadError", { reason: err.response?.data?.detail || err.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [status, sort]);

  const columns = [
    {
      title: t("admin.businessName"),
      key: "business",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Button type="link" style={{ padding: 0, height: "auto" }} onClick={() => navigate(`/admin/businesses/${record.id}`)}>
            {record.business_name || t("admin.unnamedBusiness")}
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
        </Space>
      ),
    },
    {
      title: t("common.status"),
      key: "status",
      render: (_, record) => (
        <Space size={4} wrap>
          <Tag color={record.account_active ? "success" : "red"}>{record.account_active ? t("common.active") : t("common.inactive")}</Tag>
          <Tag color={record.is_active ? "blue" : "default"}>{record.is_active ? t("admin.hasActiveChannel") : t("admin.noActiveChannel")}</Tag>
        </Space>
      ),
    },
    { title: t("admin.channelCount"), dataIndex: "channel_count", sorter: (a, b) => a.channel_count - b.channel_count, render: formatNumber },
    { title: t("admin.employeeCount"), dataIndex: "employee_count", sorter: (a, b) => a.employee_count - b.employee_count, render: formatNumber },
    { title: t("admin.conversationCount"), dataIndex: "conversation_count", sorter: (a, b) => a.conversation_count - b.conversation_count, render: formatNumber },
    { title: t("admin.messageCount"), dataIndex: "message_count", sorter: (a, b) => a.message_count - b.message_count, render: formatNumber },
    { title: t("admin.aiMessages"), dataIndex: "ai_message_count", sorter: (a, b) => a.ai_message_count - b.ai_message_count, render: formatNumber },
    { title: t("admin.productCount"), dataIndex: "product_count", sorter: (a, b) => a.product_count - b.product_count, render: formatNumber },
    {
      title: t("admin.lastActivity"),
      dataIndex: "last_conversation_at",
      render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/admin/businesses/${record.id}`)}>
          {t("admin.viewDetail")}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, minHeight: "calc(100vh - 64px)", background: token.colorBgLayout }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <ShopOutlined /> {t("admin.businessDirectory")}
          </Title>
          <Text type="secondary">{t("admin.businessDirectorySubtitle")}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchBusinesses} loading={loading}>{t("statistics.refresh")}</Button>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={fetchBusinesses}
            placeholder={t("admin.searchBusiness")}
            style={{ width: 280 }}
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 160 }}
            options={[
              { value: "all", label: t("admin.allBusinesses") },
              { value: "active", label: t("admin.activeOnly") },
              { value: "inactive", label: t("admin.inactiveOnly") },
            ]}
          />
          <Select
            value={sort}
            onChange={setSort}
            style={{ width: 210 }}
            options={[
              { value: "created_desc", label: t("admin.sortNewest") },
              { value: "created_asc", label: t("admin.sortOldest") },
              { value: "conversation_desc", label: t("admin.sortConversations") },
              { value: "message_desc", label: t("admin.sortMessages") },
              { value: "ai_desc", label: t("admin.sortAI") },
              { value: "channel_desc", label: t("admin.sortChannels") },
              { value: "product_desc", label: t("admin.sortProducts") },
            ]}
          />
          <Button type="primary" onClick={fetchBusinesses}>{t("common.search")}</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1180 }}
          pagination={{
            pageSize: 12,
            showSizeChanger: true,
            showTotal: (total) => t("admin.totalBusinessCount", { total }),
          }}
        />
      </Card>
    </div>
  );
}

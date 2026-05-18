import { useEffect, useState } from "react";
import { Button, Card, Col, Descriptions, Row, Space, Spin, Statistic, Table, Tag, Typography, message, theme } from "antd";
import { ArrowLeftOutlined, MessageOutlined, RobotOutlined, ShopOutlined, TeamOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";
import { BarList, ChartCard, DonutChart, formatNumber } from "../components/AdminCharts";

const { Title, Text } = Typography;

export default function AdminBusinessDetail() {
  const { businessId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/api/admin/businesses/${businessId}`);
      setData(res.data);
    } catch (err) {
      message.error(t("admin.loadError", { reason: err.response?.data?.detail || err.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [businessId]);

  const business = data?.business;
  const summary = data?.summary || {};

  const channelColumns = [
    { title: t("channels.platform"), dataIndex: "platform" },
    { title: t("channels.channelName"), dataIndex: "name" },
    { title: t("common.status"), dataIndex: "is_active", render: (value) => <Tag color={value ? "success" : "default"}>{value ? t("common.active") : t("common.inactive")}</Tag> },
    { title: t("admin.conversationCount"), dataIndex: "conversation_count", render: formatNumber },
    { title: t("channels.connectedAt"), dataIndex: "created_at", render: (value) => dayjs(value).format("DD/MM/YYYY") },
  ];

  const employeeColumns = [
    { title: t("employees.fullName"), dataIndex: "full_name", render: (value, record) => value || record.email },
    { title: "Email", dataIndex: "email" },
    { title: t("common.status"), dataIndex: "is_active", render: (value) => <Tag color={value ? "success" : "red"}>{value ? t("common.active") : t("common.inactive")}</Tag> },
    { title: t("admin.assignedConversations"), dataIndex: "assigned_conversation_count", render: formatNumber },
  ];

  const conversationColumns = [
    { title: t("admin.contact"), dataIndex: "contact_name", render: (value) => value || "-" },
    { title: t("channels.platform"), dataIndex: "platform" },
    { title: t("common.status"), dataIndex: "status", render: (value) => <Tag color={value === "open" ? "green" : "default"}>{value}</Tag> },
    {
      title: t("chat.assignee"),
      key: "assignee",
      render: (_, record) => record.assigned_to_name || (record.assigned_to_business ? t("statistics.business") : t("statistics.unassigned")),
    },
    { title: t("admin.ai"), dataIndex: "is_ai_enabled", render: (value) => <Tag color={value ? "purple" : "default"}>{value ? "AI on" : "AI off"}</Tag> },
    { title: t("admin.messageCount"), dataIndex: "message_count", render: formatNumber },
    { title: t("admin.lastActivity"), dataIndex: "last_message_at", render: (value) => value ? dayjs(value).format("DD/MM HH:mm") : "-" },
  ];

  return (
    <div style={{ padding: 24, minHeight: "calc(100vh - 64px)", background: token.colorBgLayout }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/admin/businesses")} style={{ marginBottom: 16 }}>
        {t("admin.backToBusinesses")}
      </Button>

      {loading && !data ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin /></div>
      ) : business ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>{business.business_name || t("admin.unnamedBusiness")}</Title>
              <Text type="secondary">{business.email}</Text>
            </div>
            <Space wrap>
              <Tag color={business.account_active ? "success" : "red"}>{business.account_active ? t("common.active") : t("common.inactive")}</Tag>
              <Tag color={business.is_active ? "blue" : "default"}>{business.is_active ? t("admin.hasActiveChannel") : t("admin.noActiveChannel")}</Tag>
            </Space>
          </div>

          <Card style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, md: 2, xl: 4 }} size="small">
              <Descriptions.Item label={t("admin.registeredAt")}>{dayjs(business.created_at).format("DD/MM/YYYY HH:mm")}</Descriptions.Item>
              <Descriptions.Item label={t("admin.lastActivity")}>{business.last_conversation_at ? dayjs(business.last_conversation_at).format("DD/MM/YYYY HH:mm") : "-"}</Descriptions.Item>
              <Descriptions.Item label={t("admin.openConversations")}>{formatNumber(business.open_conversation_count)}</Descriptions.Item>
              <Descriptions.Item label={t("admin.unassignedConversations")}>{formatNumber(business.unassigned_count)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalChannels")} value={summary.total_channels} prefix={<ShopOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalEmployees")} value={summary.total_employees} prefix={<TeamOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalConversations")} value={summary.total_conversations} prefix={<MessageOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.aiMessages")} value={summary.total_ai_messages} prefix={<RobotOutlined />} /></Card></Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={8}><Card><Statistic title={t("admin.totalMessages")} value={summary.total_messages} /></Card></Col>
            <Col xs={24} lg={8}><Card><Statistic title={t("admin.totalContacts")} value={summary.total_contacts} /></Card></Col>
            <Col xs={24} lg={8}><Card><Statistic title={t("admin.totalProducts")} value={summary.total_products} /></Card></Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={8}>
              <ChartCard title={t("admin.platformUsage")}><DonutChart data={data.platforms || []} /></ChartCard>
            </Col>
            <Col xs={24} lg={8}>
              <ChartCard title={t("admin.assignmentOverview")}>
                <BarList data={data.assignments || []} color="#52c41a" />
              </ChartCard>
            </Col>
            <Col xs={24} lg={8}>
              <ChartCard title={t("admin.productStatus")}>
                <DonutChart data={data.product_status || []} />
              </ChartCard>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={12}>
              <Card title={t("nav.channels")}>
                <Table columns={channelColumns} dataSource={data.channels || []} rowKey="id" pagination={{ pageSize: 6 }} />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title={t("nav.employees")}>
                <Table columns={employeeColumns} dataSource={data.employees || []} rowKey="id" pagination={{ pageSize: 6 }} />
              </Card>
            </Col>
          </Row>

          <Card title={t("admin.recentConversations")} style={{ marginTop: 16 }}>
            <Table columns={conversationColumns} dataSource={data.recent_conversations || []} rowKey="id" pagination={{ pageSize: 8 }} scroll={{ x: 900 }} />
          </Card>
        </>
      ) : null}
    </div>
  );
}

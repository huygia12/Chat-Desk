import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Row, Select, Space, Spin, Statistic, Typography, message, theme } from "antd";
import {
  ApiOutlined,
  MessageOutlined,
  ReloadOutlined,
  RobotOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";
import { BarList, ChartCard, DonutChart, VolumeChart, formatNumber } from "../components/AdminCharts";

const { Title, Text } = Typography;

export default function AdminAnalytics() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/admin/analytics", { params: { days } });
      setData(res.data);
    } catch (err) {
      message.error(t("admin.loadError", { reason: err.response?.data?.detail || err.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [days]);

  const summary = data?.summary || {};
  const aiShare = useMemo(() => {
    if (!summary.total_messages) return "0%";
    return `${Math.round((summary.total_ai_messages / summary.total_messages) * 100)}%`;
  }, [summary.total_ai_messages, summary.total_messages]);

  const businessLabel = (item) => item.business_name || item.email;

  return (
    <div style={{ padding: 24, minHeight: "calc(100vh - 64px)", background: token.colorBgLayout }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{t("admin.analyticsTitle")}</Title>
          <Text type="secondary">{t("admin.analyticsSubtitle")}</Text>
        </div>
        <Space wrap>
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 132 }}
            options={[
              { value: 7, label: t("statistics.last7Days") },
              { value: 14, label: t("statistics.last14Days") },
              { value: 30, label: t("statistics.last30Days") },
              { value: 90, label: t("statistics.last90Days") },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>{t("statistics.refresh")}</Button>
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin /></div>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalBusinesses")} value={summary.total_businesses} prefix={<ShopOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.activeBusinesses")} value={summary.active_businesses} prefix={<TeamOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalChannels")} value={summary.total_channels} prefix={<ApiOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalMessages")} value={summary.total_messages} prefix={<MessageOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalConversations")} value={summary.total_conversations} prefix={<MessageOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalContacts")} value={summary.total_contacts} prefix={<TeamOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.totalProducts")} value={summary.total_products} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title={t("admin.aiUsage")} value={summary.total_ai_messages || 0} suffix={aiShare} prefix={<RobotOutlined />} /></Card></Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={16}>
              <ChartCard title={t("admin.systemVolume")}>
                <VolumeChart
                  data={data?.volume || []}
                  labels={{
                    conversations: t("statistics.conversations"),
                    messages: t("statistics.messages"),
                    aiMessages: t("admin.aiMessages"),
                  }}
                />
              </ChartCard>
            </Col>
            <Col xs={24} xl={8}>
              <ChartCard title={t("admin.platformUsage")}>
                <DonutChart data={data?.platforms || []} />
              </ChartCard>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={8}>
              <ChartCard title={t("admin.senderMix")}>
                <DonutChart data={data?.sender_types || []} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={8}>
              <ChartCard title={t("admin.topBusinessConversations")}>
                <BarList
                  data={(data?.top_businesses_by_conversations || []).map((item) => ({
                    ...item,
                    name: businessLabel(item),
                    count: item.conversation_count,
                  }))}
                  renderLabel={(item) => (
                    <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/businesses/${item.id}`)}>
                      {item.name}
                    </Button>
                  )}
                  renderMeta={(item) => <Text type="secondary" style={{ display: "block", fontSize: 12 }}>{formatNumber(item.message_count)} {t("statistics.messages")}</Text>}
                />
              </ChartCard>
            </Col>
            <Col xs={24} lg={8}>
              <ChartCard title={t("admin.topBusinessAI")}>
                <BarList
                  color="#722ed1"
                  data={(data?.top_businesses_by_ai || []).map((item) => ({
                    ...item,
                    name: businessLabel(item),
                    count: item.ai_message_count,
                  }))}
                  renderLabel={(item) => (
                    <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/businesses/${item.id}`)}>
                      {item.name}
                    </Button>
                  )}
                  renderMeta={(item) => <Text type="secondary" style={{ display: "block", fontSize: 12 }}>{formatNumber(item.message_count)} {t("statistics.messages")}</Text>}
                />
              </ChartCard>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

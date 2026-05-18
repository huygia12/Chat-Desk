import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
  theme,
} from "antd";
import {
  BarChartOutlined,
  LineChartOutlined,
  MessageOutlined,
  ReloadOutlined,
  RobotOutlined,
  TagsOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";

const { Title, Text } = Typography;

const CHART_COLORS = ["#1677ff", "#52c41a", "#faad14", "#eb2f96", "#722ed1", "#13c2c2", "#fa541c", "#2f54eb"];

const formatNumber = (value) => Number(value || 0).toLocaleString("vi-VN");

const formatMinutes = (value) => {
  if (value == null) return "-";
  if (value < 60) return `${Math.round(value)}m`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

function StatCard({ title, value, prefix, suffix }) {
  return (
    <Card size="small">
      <Statistic title={title} value={value ?? 0} prefix={prefix} suffix={suffix} />
    </Card>
  );
}

function ChartCard({ title, extra, children }) {
  return (
    <Card
      title={<span style={{ fontSize: 14 }}>{title}</span>}
      extra={extra}
      styles={{ body: { minHeight: 260 } }}
    >
      {children}
    </Card>
  );
}

function VolumeChart({ data, token, t }) {
  const width = 720;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 34, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.conversations, item.messages]));
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const points = data.map((item, index) => {
    const x = padding.left + index * stepX;
    const y = padding.top + innerHeight - (item.conversations / maxValue) * innerHeight;
    return `${x},${y}`;
  });
  const barWidth = Math.max(6, Math.min(18, innerWidth / Math.max(data.length, 1) - 8));

  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 260, display: "block" }}>
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} stroke={token.colorBorder} />
        <line x1={padding.left} y1={padding.top + innerHeight} x2={width - padding.right} y2={padding.top + innerHeight} stroke={token.colorBorder} />
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padding.top + innerHeight * ratio;
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={token.colorBorderSecondary}
              strokeDasharray="4 6"
            />
          );
        })}
        {data.map((item, index) => {
          const x = padding.left + index * stepX - barWidth / 2;
          const barHeight = (item.messages / maxValue) * innerHeight;
          return (
            <g key={item.date}>
              <rect
                x={x}
                y={padding.top + innerHeight - barHeight}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill="#91caff"
              />
              {(index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 5) === 0) && (
                <text
                  x={padding.left + index * stepX}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill={token.colorTextSecondary}
                >
                  {dayjs(item.date).format("DD/MM")}
                </text>
              )}
            </g>
          );
        })}
        <polyline points={points.join(" ")} fill="none" stroke="#1677ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((item, index) => {
          const x = padding.left + index * stepX;
          const y = padding.top + innerHeight - (item.conversations / maxValue) * innerHeight;
          return <circle key={`${item.date}-point`} cx={x} cy={y} r="4" fill="#1677ff" stroke={token.colorBgContainer} strokeWidth="2" />;
        })}
      </svg>
      <Space size={16}>
        <Badge color="#1677ff" text={t("statistics.conversations")} />
        <Badge color="#91caff" text={t("statistics.messages")} />
      </Space>
    </div>
  );
}

function DonutChart({ data, token }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  let cursor = 0;
  const gradient = data
    .map((item, index) => {
      const start = cursor;
      cursor += (item.count / total) * 360;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}deg ${cursor}deg`;
    })
    .join(", ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, alignItems: "center" }}>
      <div
        style={{
          width: 150,
          height: 150,
          borderRadius: "50%",
          background: `conic-gradient(${gradient})`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 28,
            borderRadius: "50%",
            background: token.colorBgContainer,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
          }}
        >
          {formatNumber(total)}
        </div>
      </div>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {data.map((item, index) => (
          <div key={item.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Badge color={CHART_COLORS[index % CHART_COLORS.length]} text={item.label} />
            <Text strong>{formatNumber(item.count)}</Text>
          </div>
        ))}
      </Space>
    </div>
  );
}

function BarList({ data, color = "#1677ff", renderLabel, renderMeta, token }) {
  const maxValue = Math.max(1, ...data.map((item) => item.count));
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {data.map((item, index) => (
        <div key={item.id || item.key || item.name}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            <span style={{ minWidth: 0 }}>
              {renderLabel ? renderLabel(item, index) : <Text ellipsis>{item.name || item.label}</Text>}
              {renderMeta && renderMeta(item)}
            </span>
            <Text strong>{formatNumber(item.count)}</Text>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: token.colorFillSecondary, overflow: "hidden" }}>
            <div
              style={{
                width: `${(item.count / maxValue) * 100}%`,
                height: "100%",
                borderRadius: 4,
                background: item.color || color,
              }}
            />
          </div>
        </div>
      ))}
    </Space>
  );
}

export default function Statistics() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const { token } = theme.useToken();

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/statistics/business", { params: { days } });
      setData(res.data);
    } catch (err) {
      message.error(err.response?.data?.detail || t("statistics.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, [days]);

  const summary = data?.summary || {};
  const aiShare = useMemo(() => {
    if (!summary.total_messages) return "0%";
    return `${Math.round((summary.ai_messages / summary.total_messages) * 100)}%`;
  }, [summary.ai_messages, summary.total_messages]);

  return (
    <div style={{ padding: 24, minHeight: "calc(100vh - 64px)", background: token.colorBgLayout }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {t("statistics.title")}
          </Title>
          <Text type="secondary">{t("statistics.subtitle")}</Text>
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
          <Button icon={<ReloadOutlined />} onClick={fetchStatistics} loading={loading}>
            {t("statistics.refresh")}
          </Button>
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <Spin />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title={t("statistics.totalConversations")} value={summary.total_conversations} prefix={<MessageOutlined />} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title={t("statistics.totalContacts")} value={summary.total_contacts} prefix={<TeamOutlined />} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title={t("statistics.totalMessages")} value={summary.total_messages} prefix={<BarChartOutlined />} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard title={t("statistics.aiMessages")} value={summary.ai_messages} prefix={<RobotOutlined />} suffix={aiShare} />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} md={8}>
              <StatCard title={t("statistics.openConversations")} value={summary.open_conversations} />
            </Col>
            <Col xs={24} md={8}>
              <StatCard title={t("statistics.unassignedConversations")} value={summary.unassigned_conversations} />
            </Col>
            <Col xs={24} md={8}>
              <StatCard title={t("statistics.avgFirstResponse")} value={formatMinutes(summary.avg_first_response_minutes)} />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={16}>
              <ChartCard title={t("statistics.volumeTitle")} extra={<LineChartOutlined />}>
                <VolumeChart data={data?.volume || []} token={token} t={t} />
              </ChartCard>
            </Col>
            <Col xs={24} xl={8}>
              <ChartCard title={t("statistics.platformTitle")}>
                <DonutChart data={data?.platforms || []} token={token} />
              </ChartCard>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <ChartCard title={t("statistics.assignmentTitle")}>
                <BarList
                  data={data?.assignments || []}
                  token={token}
                  color="#52c41a"
                  renderLabel={(item) => (
                    <Space size={6}>
                      <Text>{item.name}</Text>
                      <Tag color={item.type === "employee" ? "green" : item.type === "business" ? "blue" : "default"}>
                        {t(`statistics.${item.type}`)}
                      </Tag>
                    </Space>
                  )}
                />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title={t("statistics.channelTitle")}>
                <BarList
                  data={data?.channels || []}
                  token={token}
                  color="#1677ff"
                  renderLabel={(item) => <Text ellipsis>{item.name}</Text>}
                  renderMeta={(item) => (
                    <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                      {item.platform}
                    </Text>
                  )}
                />
              </ChartCard>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <ChartCard title={t("statistics.senderTitle")}>
                <DonutChart data={data?.sender_types || []} token={token} />
              </ChartCard>
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard title={t("statistics.labelTitle")} extra={<TagsOutlined />}>
                <BarList
                  data={data?.top_labels || []}
                  token={token}
                  renderLabel={(item) => (
                    <Space size={8}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, display: "inline-block" }} />
                      <Text>{item.name}</Text>
                    </Space>
                  )}
                />
              </ChartCard>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

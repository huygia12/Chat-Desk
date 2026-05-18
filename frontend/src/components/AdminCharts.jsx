import { Badge, Card, Empty, Space, Typography, theme } from "antd";
import dayjs from "dayjs";

const { Text } = Typography;

export const chartColors = ["#1677ff", "#52c41a", "#faad14", "#eb2f96", "#722ed1", "#13c2c2", "#fa541c", "#2f54eb"];

export const formatNumber = (value) => Number(value || 0).toLocaleString("vi-VN");

export function ChartCard({ title, extra, children, minHeight = 260 }) {
  return (
    <Card title={<span style={{ fontSize: 14 }}>{title}</span>} extra={extra} styles={{ body: { minHeight } }}>
      {children}
    </Card>
  );
}

export function BarList({ data, color = "#1677ff", renderLabel, renderMeta }) {
  const { token } = theme.useToken();
  const maxValue = Math.max(1, ...data.map((item) => item.count));
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {data.map((item, index) => (
        <div key={item.id || item.key || item.name || index}>
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

export function DonutChart({ data }) {
  const { token } = theme.useToken();
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  let cursor = 0;
  const gradient = data
    .map((item, index) => {
      const start = cursor;
      cursor += (item.count / total) * 360;
      return `${chartColors[index % chartColors.length]} ${start}deg ${cursor}deg`;
    })
    .join(", ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, alignItems: "center" }}>
      <div style={{ width: 150, height: 150, borderRadius: "50%", background: `conic-gradient(${gradient})`, position: "relative" }}>
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
          <div key={item.key || item.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Badge color={chartColors[index % chartColors.length]} text={item.label} />
            <Text strong>{formatNumber(item.count)}</Text>
          </div>
        ))}
      </Space>
    </div>
  );
}

export function VolumeChart({ data, labels }) {
  const { token } = theme.useToken();
  const width = 720;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 34, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.conversations, item.messages, item.ai_messages || 0]));
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const barWidth = Math.max(6, Math.min(18, innerWidth / Math.max(data.length, 1) - 8));
  const points = data.map((item, index) => {
    const x = padding.left + index * stepX;
    const y = padding.top + innerHeight - (item.conversations / maxValue) * innerHeight;
    return `${x},${y}`;
  });

  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 260, display: "block" }}>
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} stroke={token.colorBorder} />
        <line x1={padding.left} y1={padding.top + innerHeight} x2={width - padding.right} y2={padding.top + innerHeight} stroke={token.colorBorder} />
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padding.top + innerHeight * ratio;
          return <line key={ratio} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={token.colorBorderSecondary} strokeDasharray="4 6" />;
        })}
        {data.map((item, index) => {
          const x = padding.left + index * stepX - barWidth / 2;
          const messageHeight = (item.messages / maxValue) * innerHeight;
          const aiHeight = ((item.ai_messages || 0) / maxValue) * innerHeight;
          return (
            <g key={item.date}>
              <rect x={x} y={padding.top + innerHeight - messageHeight} width={barWidth} height={messageHeight} rx={3} fill="#91caff" />
              <rect x={x} y={padding.top + innerHeight - aiHeight} width={barWidth} height={aiHeight} rx={3} fill="#722ed1" opacity="0.8" />
              {(index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 5) === 0) && (
                <text x={padding.left + index * stepX} y={height - 10} textAnchor="middle" fontSize="11" fill={token.colorTextSecondary}>
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
      <Space size={16} wrap>
        <Badge color="#1677ff" text={labels.conversations} />
        <Badge color="#91caff" text={labels.messages} />
        <Badge color="#722ed1" text={labels.aiMessages} />
      </Space>
    </div>
  );
}

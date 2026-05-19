import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from "antd";
import {
  BranchesOutlined,
  ReloadOutlined,
  ShopOutlined,
  TagsOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";

const { Title, Text } = Typography;

const PLATFORM_RULES = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "telegram", label: "Telegram" },
  { key: "widget", label: "Widget" },
];
const EMPLOYEE_TABLE_SCROLL_Y = 240;

const normalizeRuleAssignees = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
};

export default function AssignmentSettings() {
  const [settings, setSettings] = useState(null);
  const [overview, setOverview] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [labels, setLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const { token } = theme.useToken();

  const employeeOptions = useMemo(
    () =>
      assignees
        .filter((assignee) => assignee.type === "employee")
        .map((assignee) => ({
          value: assignee.id,
          label: assignee.name,
        })),
    [assignees],
  );
  const labelOptions = useMemo(
    () =>
      labels.map((label) => ({
        value: label.id,
        label: label.name,
      })),
    [labels],
  );
  const selectedLabel = useMemo(
    () => labels.find((label) => label.id === selectedLabelId),
    [labels, selectedLabelId],
  );

  const fetchCenter = async () => {
    setLoading(true);
    try {
      const [settingsRes, overviewRes, assigneesRes, labelsRes] = await Promise.all([
        client.get("/api/assignments/settings"),
        client.get("/api/assignments/overview"),
        client.get("/api/assignments/assignees"),
        client.get("/api/labels"),
      ]);
      setSettings(settingsRes.data);
        setOverview(overviewRes.data);
        setAssignees(assigneesRes.data);
        setLabels(labelsRes.data);
        setSelectedLabelId((current) => {
          if (current && labelsRes.data.some((label) => label.id === current)) return current;
          return labelsRes.data[0]?.id;
        });
      } catch {
      message.error(t("assignment.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCenter();
  }, []);

  const patchSettings = async (patch) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    setSaving(true);
    try {
      const res = await client.patch("/api/assignments/settings", patch);
      setSettings(res.data);
      message.success(t("assignment.updateSuccess"));
    } catch {
      setSettings(settings);
      message.error(t("assignment.updateError"));
    } finally {
      setSaving(false);
    }
  };

  const setChannelRule = (platform, assigneeIds) => {
    patchSettings({
      channel_assignment_rules: {
        ...(settings?.channel_assignment_rules || {}),
        [platform]: assigneeIds?.length ? assigneeIds : null,
      },
    });
  };

  const setLabelRule = (labelId, assigneeIds) => {
    patchSettings({
      label_assignment_rules: {
        ...(settings?.label_assignment_rules || {}),
        [labelId]: assigneeIds?.length ? assigneeIds : null,
      },
    });
  };

  const employeeRows = overview?.employee_assigned || [];

  const employeeColumns = [
    {
      title: t("assignment.employee"),
      dataIndex: "name",
      key: "name",
      render: (name, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.email}
          </Text>
        </Space>
      ),
    },
    {
      title: t("assignment.activeConversations"),
      dataIndex: "count",
      key: "count",
      width: 170,
      align: "right",
      render: (count) => <Tag color={count ? "blue" : "default"}>{count}</Tag>,
    },
  ];

  const autoAssignEnabled = Boolean(settings?.auto_assign_enabled);

  return (
    <div style={{ padding: 24, maxWidth: 1180 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
            {t("assignment.title")}
          </Title>
          <Text type="secondary">
            {t("assignment.subtitle")}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchCenter}>
          {t("assignment.refresh")}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t("assignment.unassignedConversations")}
              value={overview?.unassigned_count || 0}
              prefix={<UserSwitchOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t("assignment.businessAssignedConversations")}
              value={overview?.business_assigned_count || 0}
              prefix={<ShopOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t("assignment.totalConversations")}
              value={overview?.total_conversations || 0}
              prefix={<BranchesOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} lg={14} style={{ display: "flex" }}>
          <Card
            title={
              <Space>
                <TeamOutlined />
                <span>{t("assignment.overviewTitle")}</span>
              </Space>
            }
            loading={loading}
            style={{ width: "100%" }}
            styles={{ body: { overflow: "hidden" } }}
          >
            <Table
              rowKey="assignee_id"
              size="small"
              pagination={false}
              scroll={{ y: EMPLOYEE_TABLE_SCROLL_Y }}
              columns={employeeColumns}
              dataSource={employeeRows}
              locale={{ emptyText: t("assignment.noEmployees") }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10} style={{ display: "flex" }}>
          <Card
            title={t("assignment.autoAssignmentSection")}
            loading={loading}
            style={{ width: "100%" }}
          >
            <Space direction="vertical" size={18} style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <Text strong>{t("assignment.lockTitle")}</Text>
                  <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                    {t("assignment.lockDescription")}
                  </Text>
                </div>
                <Switch
                  checked={Boolean(settings?.employee_assignment_locked)}
                  loading={saving}
                  onChange={(checked) => patchSettings({ employee_assignment_locked: checked })}
                />
              </div>

              <div style={{ height: 1, background: token.colorBorderSecondary }} />

              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <Text strong>{t("assignment.enableAutoAssign")}</Text>
                  <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                    {t("assignment.autoAssignDescription")}
                  </Text>
                </div>
                <Switch
                  checked={autoAssignEnabled}
                  loading={saving}
                  onChange={(checked) => patchSettings({ auto_assign_enabled: checked })}
                />
              </div>

              <div>
                <Text strong>{t("assignment.strategy")}</Text>
                <Select
                  value={settings?.auto_assign_strategy || "round_robin"}
                  disabled={!autoAssignEnabled || saving}
                  onChange={(value) => patchSettings({ auto_assign_strategy: value })}
                  style={{ width: "100%", marginTop: 8 }}
                  options={[
                    { value: "round_robin", label: t("assignment.roundRobinActive") },
                    { value: "least_active", label: t("assignment.leastActive") },
                  ]}
                />
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <div style={{ marginTop: 4 }}>
            <Title level={4} style={{ margin: 0 }}>
              {t("assignment.routingRules")}
            </Title>
            <Text type="secondary">
              {autoAssignEnabled
                ? t("assignment.routingRulesDescription")
                : t("assignment.routingRulesDisabledDescription")}
            </Text>
          </div>
        </Col>

        <Col xs={24}>
          <Alert
            type="info"
            showIcon
            message={t("assignment.conflictResolution")}
            description={t("assignment.conflictResolutionDescription")}
          />
        </Col>

        <Col xs={24} lg={12} style={{ order: 2 }}>
          <Card
            title={
              <Space>
                <BranchesOutlined />
                <span>{t("assignment.byChannel")}</span>
              </Space>
            }
            loading={loading}
            style={{
              opacity: autoAssignEnabled ? 1 : 0.58,
              pointerEvents: autoAssignEnabled ? "auto" : "none",
            }}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {PLATFORM_RULES.map((platform) => (
                <div
                  key={platform.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1fr",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Text strong>{platform.label}</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    maxTagCount="responsive"
                    disabled={!autoAssignEnabled || saving}
                    placeholder={t("assignment.selectEmployees")}
                    optionFilterProp="label"
                    value={normalizeRuleAssignees(settings?.channel_assignment_rules?.[platform.key])}
                    onChange={(value) => setChannelRule(platform.key, value)}
                    options={employeeOptions}
                  />
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12} style={{ order: 1 }}>
          <Card
            title={
              <Space>
                <TagsOutlined />
                <span>{t("assignment.byLabel")}</span>
              </Space>
            }
            loading={loading}
            style={{
              opacity: autoAssignEnabled ? 1 : 0.58,
              pointerEvents: autoAssignEnabled ? "auto" : "none",
            }}
          >
            {labels.length === 0 ? (
              <Empty description={t("assignment.noLabels")} />
            ) : (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Select
                  showSearch
                  placeholder={t("assignment.searchLabel")}
                  optionFilterProp="label"
                  value={selectedLabelId}
                  onChange={setSelectedLabelId}
                  options={labelOptions}
                  style={{ width: "100%" }}
                />
                {selectedLabel && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(120px, 1fr) minmax(180px, 1.4fr)",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <Tag color={selectedLabel.color}>{selectedLabel.name}</Tag>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      maxTagCount="responsive"
                      disabled={!autoAssignEnabled || saving}
                      placeholder={t("assignment.selectEmployees")}
                      optionFilterProp="label"
                      value={normalizeRuleAssignees(settings?.label_assignment_rules?.[selectedLabel.id])}
                      onChange={(value) => setLabelRule(selectedLabel.id, value)}
                      options={employeeOptions}
                    />
                  </div>
                )}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {employeeOptions.length === 0 && !loading && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message={t("assignment.noActiveEmployees")}
        />
      )}
    </div>
  );
}

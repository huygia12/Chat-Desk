import { useEffect, useState } from "react";
import { Card, Switch, Typography, message } from "antd";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";

const { Title, Text } = Typography;

export default function AssignmentSettings() {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/assignments/settings");
      setLocked(res.data.employee_assignment_locked);
    } catch {
      message.error(t("assignment.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggle = async (checked) => {
    setLoading(true);
    try {
      const res = await client.patch("/api/assignments/settings", {
        employee_assignment_locked: checked,
      });
      setLocked(res.data.employee_assignment_locked);
      message.success(t("assignment.updateSuccess"));
    } catch {
      message.error(t("assignment.updateError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {t("assignment.title")}
      </Title>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <Text strong>{t("assignment.lockTitle")}</Text>
            <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              {t("assignment.lockDescription")}
            </Text>
          </div>
          <Switch checked={locked} loading={loading} onChange={handleToggle} />
        </div>
      </Card>
    </div>
  );
}

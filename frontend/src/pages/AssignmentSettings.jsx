import { useEffect, useState } from "react";
import { Card, Switch, Typography, message } from "antd";
import client from "../api/client";

const { Title, Text } = Typography;

export default function AssignmentSettings() {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/assignments/settings");
      setLocked(res.data.employee_assignment_locked);
    } catch {
      message.error("Không thể tải cấu hình assign");
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
      message.success("Đã cập nhật cấu hình assign");
    } catch {
      message.error("Cập nhật cấu hình thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        Quản lý assign
      </Title>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <Text strong>Khóa quyền nhân viên tự đổi assignee</Text>
            <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              Khi bật, nhân viên không thể tự unassign hoặc reassign conversation.
            </Text>
          </div>
          <Switch checked={locked} loading={loading} onChange={handleToggle} />
        </div>
      </Card>
    </div>
  );
}

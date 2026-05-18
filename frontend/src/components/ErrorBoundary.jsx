import React from "react";
import { Alert, Button } from "antd";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI render error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="Không thể hiển thị giao diện"
          description={this.state.error?.message || "Đã có lỗi render ở frontend."}
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Tải lại
            </Button>
          }
        />
      </div>
    );
  }
}

import json
import logging
from fastapi import WebSocket
from typing import Dict, List

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage WebSocket connections per business_id."""

    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, business_id: str, websocket: WebSocket):
        await websocket.accept()
        if business_id not in self.active_connections:
            self.active_connections[business_id] = []
        self.active_connections[business_id].append(websocket)
        logger.info(f"WebSocket connected: business {business_id}")

    def disconnect(self, business_id: str, websocket: WebSocket):
        if business_id in self.active_connections:
            self.active_connections[business_id].remove(websocket)
            if not self.active_connections[business_id]:
                del self.active_connections[business_id]
        logger.info(f"WebSocket disconnected: business {business_id}")

    async def send_message(self, business_id: str, message: dict):
        """Send message to all connections of a business."""
        if business_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[business_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.append(connection)
            # Clean up dead connections
            for conn in dead_connections:
                self.active_connections[business_id].remove(conn)


# Singleton
manager = ConnectionManager()

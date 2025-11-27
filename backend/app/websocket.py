"""
WebSocket manager for real-time updates
"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # org_id -> set of websockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, org_id: str):
        await websocket.accept()
        if org_id not in self.active_connections:
            self.active_connections[org_id] = set()
        self.active_connections[org_id].add(websocket)
        logger.info(f"WebSocket connected for org: {org_id}")
    
    def disconnect(self, websocket: WebSocket, org_id: str):
        if org_id in self.active_connections:
            self.active_connections[org_id].discard(websocket)
            if not self.active_connections[org_id]:
                del self.active_connections[org_id]
        logger.info(f"WebSocket disconnected for org: {org_id}")
    
    async def broadcast_to_org(self, org_id: str, message: dict):
        """Broadcast message to all connections for an org"""
        if org_id not in self.active_connections:
            return
        
        message_str = json.dumps(message)
        disconnected = set()
        
        for connection in self.active_connections[org_id]:
            try:
                await connection.send_text(message_str)
            except WebSocketDisconnect:
                disconnected.add(connection)
            except Exception as e:
                logger.error(f"Error sending message: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn, org_id)
    
    async def notify_pod_uploaded(self, org_id: str, invoice_id: str, invoice_no: str, image_url: str):
        """Notify admin portal that a POD image was uploaded"""
        await self.broadcast_to_org(org_id, {
            "type": "pod_uploaded",
            "data": {
                "invoice_id": invoice_id,
                "invoice_no": invoice_no,
                "image_url": image_url,
                "timestamp": None  # Will be set by frontend
            }
        })
    
    async def notify_delivery_completed(self, org_id: str, invoice_id: str, invoice_no: str):
        """Notify admin portal that a delivery was completed"""
        await self.broadcast_to_org(org_id, {
            "type": "delivery_completed",
            "data": {
                "invoice_id": invoice_id,
                "invoice_no": invoice_no,
                "timestamp": None
            }
        })
    
    async def notify_order_status_change(self, org_id: str, invoice_id: str, invoice_no: str, new_status: str, rider_name: str = None):
        """Notify admin portal of order status change"""
        await self.broadcast_to_org(org_id, {
            "type": "order_status_update",
            "data": {
                "invoice_id": invoice_id,
                "invoice_no": invoice_no,
                "status": new_status,
                "rider_name": rider_name,
                "timestamp": datetime.utcnow().isoformat() + 'Z'
            }
        })


# Global manager instance
manager = ConnectionManager()

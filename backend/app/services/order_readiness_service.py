import logging

logger = logging.getLogger(__name__)

ORDER_READY_TRIGGER = "order_ready"


async def detect_order_readiness(*args, **kwargs) -> dict:
    """Deprecated: order readiness now comes from the scope/intent classifier."""
    logger.warning(
        "detect_order_readiness is deprecated; use classify_ai_scope order metadata instead"
    )
    return {
        "is_order_ready": False,
        "confidence": 0.0,
        "missing_fields": [],
        "detected_fields": {},
        "reason": "deprecated detector disabled",
    }

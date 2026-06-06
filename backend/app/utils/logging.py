import json
from typing import Any


def pretty_log(value: Any) -> str:
    """Format structured values for readable multi-line logs."""
    try:
        return json.dumps(value, ensure_ascii=False, indent=2, default=str)
    except TypeError:
        return str(value)

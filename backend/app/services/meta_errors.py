class MetaSendError(RuntimeError):
    def __init__(
        self,
        detail: str,
        *,
        status_code: int,
        code: int | None = None,
        subcode: int | None = None,
        fbtrace_id: str | None = None,
    ):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code
        self.subcode = subcode
        self.fbtrace_id = fbtrace_id

    @property
    def is_outside_allowed_window(self) -> bool:
        return self.code == 10 and self.subcode == 2534022


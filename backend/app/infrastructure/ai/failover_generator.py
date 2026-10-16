from collections.abc import Sequence

from mistralai.models.sdkerror import SDKError

from app.application.errors import RateLimitExhaustedError
from app.application.ports import StudyMaterialGenerator
from app.domain.models import StudyDocument


def _is_rate_limited(error: Exception) -> bool:
    return getattr(error, "raw_status_code", None) == 429 or getattr(error, "status_code", None) == 429 or "429" in str(error) or "RESOURCE_EXHAUSTED" in str(error)


class FailoverGenerator:
    def __init__(self, primary: StudyMaterialGenerator, fallbacks: Sequence[StudyMaterialGenerator]):
        self._providers = [primary, *fallbacks]

    async def generate(self, document: StudyDocument) -> dict:
        for provider in self._providers:
            try:
                return await provider.generate(document)
            except SDKError as error:
                if not _is_rate_limited(error):
                    raise
            except Exception as error:
                if not _is_rate_limited(error):
                    raise
        raise RateLimitExhaustedError("All configured AI keys are rate-limited.")

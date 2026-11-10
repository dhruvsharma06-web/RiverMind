"""The only two errors the backend expects from the AI; it maps both to AI_UNAVAILABLE."""


class RiverAIError(Exception):
    """Base class for errors raised on purpose by rivermind_ai."""


class AIUnavailable(RiverAIError):
    """The provider is down, timed out, rate-limited, unconfigured, or the feature is not built yet."""


class InvalidOutput(RiverAIError):
    """The model's output failed schema validation after one retry."""

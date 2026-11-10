from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Root .env is shared with ai/ and scripts/, so unknown names are ignored, not rejected.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), env_ignore_empty=True, extra="ignore")

    DATABASE_URL: str = "sqlite:///./rivermind.db"
    USE_MOCK_AI: bool = True
    PAYPAL_MODE: Literal["mock", "sandbox"] = "mock"
    PAYPAL_CLIENT_ID: str = ""
    PAYPAL_CLIENT_SECRET: SecretStr = SecretStr("")
    PAYPAL_WEBHOOK_ID: str = ""
    COUNCIL_API_KEY: SecretStr = SecretStr("")
    COUNCIL_EMAIL: SecretStr = SecretStr("")  # with COUNCIL_PASSWORD: the seed creates this council user
    COUNCIL_PASSWORD: SecretStr = SecretStr("")
    CORS_ORIGINS: str = "http://localhost:3000"
    DEVICE_ID: str = Field("yamuna-okhla-01", min_length=1, max_length=64)
    DEVICE_TOKEN: SecretStr = SecretStr("")
    CAMERA_LAT: float | None = Field(None, ge=-90, le=90)
    CAMERA_LON: float | None = Field(None, ge=-180, le=180)
    MIN_BOUNTY_CENTS: int = Field(500, gt=0)
    MAX_BOUNTY_CENTS: int = Field(5000, gt=0)
    DAILY_CAP_CENTS: int = Field(20000, gt=0)
    SEED_TREASURY_CENTS: int = Field(50000, gt=0)
    COUNCIL_THRESHOLD_CENTS: int = Field(2000, gt=0)
    MAX_INVOICE_CENTS: int = Field(50000, gt=0)

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _check(self) -> "Settings":
        if self.MIN_BOUNTY_CENTS > self.MAX_BOUNTY_CENTS:
            raise ValueError("MIN_BOUNTY_CENTS must be <= MAX_BOUNTY_CENTS")
        if "*" in self.cors_origins:
            raise ValueError("CORS_ORIGINS must list exact origins, not '*'")
        if (self.CAMERA_LAT is None) != (self.CAMERA_LON is None):
            raise ValueError("set both CAMERA_LAT and CAMERA_LON, or neither")
        if self.PAYPAL_MODE == "sandbox" and not (
            self.PAYPAL_CLIENT_ID and self.PAYPAL_CLIENT_SECRET.get_secret_value()
        ):
            raise ValueError("PAYPAL_MODE=sandbox needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

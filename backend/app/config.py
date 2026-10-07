from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    librenms_url: str = ""
    librenms_api_token: str = ""
    request_timeout: float = 10.0
    cache_ttl: int = 15
    verify_ssl: bool = True
    mock_fallback: bool = True
    cors_origins: str = "http://localhost:5173"
    # Open-port check: by default only private / local addresses may be checked.
    allow_public_scan: bool = False
    # Prometheus (optional)
    prometheus_url: str = ""            # where Padi READS metrics from, e.g. http://localhost:9090
    metrics_token: str = ""             # if set, GET /metrics requires "Authorization: Bearer <token>"
    metrics_include_ports: bool = False  # per-port series on /metrics (can be thousands of series)


settings = Settings()

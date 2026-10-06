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


settings = Settings()

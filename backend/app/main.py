import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import settings
from app.services.librenms import LibreNMSError

log = logging.getLogger("librenms-ui")
app = FastAPI(title="LibreNMS UI Backend", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],  # "*" allows any
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.exception_handler(LibreNMSError)
async def lnms_error(_: Request, e: LibreNMSError):
    return JSONResponse({"error": {"code": e.code, "message": e.message}}, status_code=e.status)


@app.exception_handler(Exception)
async def unexpected(_: Request, e: Exception):
    log.exception("Unhandled error")  # details stay in server logs only
    return JSONResponse({"error": {"code": "internal", "message": "Unexpected server error."}}, status_code=500)

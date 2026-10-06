"""Illustrative mock payloads in LibreNMS response shape. Used ONLY when LibreNMS is
unreachable/unconfigured and MOCK_FALLBACK=true. Values are made up; field names mirror
the documented API output where documented."""
import re

MISSING = object()  # mock lookup miss -> reported as a 404, not as a config problem

DEVICES = [
    {"device_id": 1, "hostname": "core-sw-01", "sysName": "core-sw-01", "os": "ios", "hardware": "C9300-48P",
     "location": "DC1", "status": 1, "disabled": 0, "ignore": 0, "uptime": 864000, "last_polled": "2026-10-04 09:30:00"},
    {"device_id": 2, "hostname": "edge-rtr-01", "sysName": "edge-rtr-01", "os": "junos", "hardware": "MX204",
     "location": "DC1", "status": 1, "disabled": 0, "ignore": 0, "uptime": 432000, "last_polled": "2026-10-04 09:30:00"},
    {"device_id": 3, "hostname": "branch-fw-02", "sysName": "branch-fw-02", "os": "fortigate", "hardware": "FG-60F",
     "location": "Branch", "status": 0, "disabled": 0, "ignore": 0, "uptime": 0, "last_polled": "2026-10-04 09:20:00"},
]
PORTS = [
    {"port_id": 10, "device_id": 1, "ifName": "Gi1/0/1", "ifAlias": "uplink to edge", "ifDescr": "GigabitEthernet1/0/1",
     "ifOperStatus": "up", "ifAdminStatus": "up", "ifSpeed": 1000000000, "ifInOctets_rate": 5200000,
     "ifOutOctets_rate": 3100000, "ifInErrors_delta": 0, "ifOutErrors_delta": 0},
    {"port_id": 11, "device_id": 1, "ifName": "Gi1/0/2", "ifAlias": "", "ifDescr": "GigabitEthernet1/0/2",
     "ifOperStatus": "down", "ifAdminStatus": "up", "ifSpeed": 1000000000, "ifInOctets_rate": 0,
     "ifOutOctets_rate": 0, "ifInErrors_delta": 4, "ifOutErrors_delta": 0},
    {"port_id": 20, "device_id": 2, "ifName": "xe-0/0/1", "ifAlias": "core", "ifDescr": "xe-0/0/1",
     "ifOperStatus": "up", "ifAdminStatus": "up", "ifSpeed": 10000000000, "ifInOctets_rate": 90000000,
     "ifOutOctets_rate": 71000000, "ifInErrors_delta": 0, "ifOutErrors_delta": 0},
]
STATIC = {
    "/ping": {"message": "pong"},
    "/system": {"status": "ok", "system": [{"local_ver": "mock-data"}], "count": 1},
    "/ports": {"status": "ok", "ports": PORTS},
    "/rules": {"status": "ok", "count": 2, "rules": [
        {"id": "1", "name": "Device down", "severity": "critical"},
        {"id": "2", "name": "Port errors", "severity": "warning"}]},
    "/alerts": {"status": "ok", "count": 2, "alerts": [
        {"id": "1", "device_id": "3", "rule_id": "1", "state": "1", "alerted": "1", "open": "1", "timestamp": "2026-10-04 09:21:00"},
        {"id": "2", "device_id": "1", "rule_id": "2", "state": "1", "alerted": "1", "open": "1", "timestamp": "2026-10-04 08:02:10"}]},
    "/logs/eventlog": {"status": "ok", "count": 2, "total": "2", "logs": [
        {"hostname": "branch-fw-02", "device_id": "3", "datetime": "2026-10-04 09:20:41", "message": "Device status changed to Down", "type": "system", "severity": "5"},
        {"hostname": "core-sw-01", "device_id": "1", "datetime": "2026-10-04 08:02:10", "message": "ifOperStatus: up -> down", "type": "interface", "severity": "4"}]},
    "/services": {"status": "ok", "count": 1, "services": [[
        {"service_id": "1", "device_id": "2", "service_ip": "10.0.0.2", "service_type": "ntp_peer", "service_desc": "NTP",
         "service_status": "0", "service_changed": "1759560000", "service_message": "NTP OK"}]]},
    "/resources/links": {"status": "ok", "count": 2, "links": [
        {"id": 1, "local_port_id": 10, "local_device_id": 1, "remote_port_id": 20, "active": 1, "protocol": "lldp",
         "remote_hostname": "edge-rtr-01", "remote_device_id": 2, "remote_port": "xe-0/0/1"},
        {"id": 2, "local_port_id": 12, "local_device_id": 1, "remote_port_id": None, "active": 1, "protocol": "lldp",
         "remote_hostname": "unmanaged-ap", "remote_device_id": None, "remote_port": "eth0"}]},
}


def mock_for(path: str, params: dict | None = None):
    params = params or {}
    if path == "/devices":
        f = {"up": lambda d: d["status"] == 1 and not d["disabled"], "down": lambda d: d["status"] == 0,
             "disabled": lambda d: d["disabled"] == 1, "ignored": lambda d: d["ignore"] == 1}.get(params.get("type", "all"))
        ds = [d for d in DEVICES if f(d)] if f else DEVICES
        return {"status": "ok", "count": len(ds), "devices": ds}
    m = re.fullmatch(r"/devices/([^/]+)(/ports|/availability|/outages)?", path)
    if m:
        key, sub = m.group(1), m.group(2)
        dev = next((d for d in DEVICES if str(d["device_id"]) == key or d["hostname"] == key), None)
        if dev is None:
            return MISSING
        if sub == "/ports":
            return {"status": "ok", "ports": [p for p in PORTS if p["device_id"] == dev["device_id"]]}
        if sub == "/availability":
            return {"status": "ok", "availability": [
                {"duration": 86400, "availability_perc": "100.000000"}, {"duration": 604800, "availability_perc": "99.900000"},
                {"duration": 2592000, "availability_perc": "99.946000"}, {"duration": 31536000, "availability_perc": "99.994000"}]}
        if sub == "/outages":
            return {"status": "ok", "outages": [{"going_down": 1759559400, "up_again": 1759559760}]}
        return {"status": "ok", "devices": [dev]}
    return STATIC.get(path)

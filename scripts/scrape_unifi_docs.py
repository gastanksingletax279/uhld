#!/usr/bin/env python3
"""
Scrape the UniFi developer docs by parsing React Server Component (RSC) push
payloads embedded in the HTML. The API data lives in a type-1 push that
contains "endpoint":{...} with a full OpenAPI operation object.

Usage:
    python3 scripts/scrape_unifi_docs.py

Output: scripts/unifi_api_docs.md
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any

VERSION = "v10.1.84"
BASE = "https://developer.ui.com"

PAGES = [
    # General
    ("Getting Started",              f"/network/{VERSION}/gettingstarted"),
    ("Filtering",                    f"/network/{VERSION}/filtering"),
    ("Error Handling",               f"/network/{VERSION}/error-handling"),
    # Cloud Connector
    ("Connector - POST",             f"/network/{VERSION}/connectorpost"),
    ("Connector - GET",              f"/network/{VERSION}/connectorget"),
    ("Connector - PUT",              f"/network/{VERSION}/connectorput"),
    ("Connector - DELETE",           f"/network/{VERSION}/connectordelete"),
    ("Connector - PATCH",            f"/network/{VERSION}/connectorpatch"),
    # Application Info
    ("Get Application Info",         f"/network/{VERSION}/getinfo"),
    # Sites
    ("List Local Sites",             f"/network/{VERSION}/getsiteoverviewpage"),
    # UniFi Devices
    ("List Adopted Devices",         f"/network/{VERSION}/getadopteddeviceoverviewpage"),
    ("Adopt Devices",                f"/network/{VERSION}/adoptdevice"),
    ("Execute Port Action",          f"/network/{VERSION}/executeportaction"),
    ("Execute Device Action",        f"/network/{VERSION}/executeadopteddeviceaction"),
    ("Get Adopted Device Details",   f"/network/{VERSION}/getadopteddevicedetails"),
    ("Remove Device",                f"/network/{VERSION}/removedevice"),
    ("Get Device Statistics",        f"/network/{VERSION}/getadopteddevicelateststatistics"),
    ("List Pending Devices",         f"/network/{VERSION}/getpendingdevicepage"),
    # Clients
    ("Execute Client Action",        f"/network/{VERSION}/executeconnectedclientaction"),
    ("List Connected Clients",       f"/network/{VERSION}/getconnectedclientoverviewpage"),
    ("Get Client Details",           f"/network/{VERSION}/getconnectedclientdetails"),
    # Networks
    ("Get Network Details",          f"/network/{VERSION}/getnetworkdetails"),
    ("Update Network",               f"/network/{VERSION}/updatenetwork"),
    ("Delete Network",               f"/network/{VERSION}/deletenetwork"),
    ("List Networks",                f"/network/{VERSION}/getnetworksoverviewpage"),
    ("Create Network",               f"/network/{VERSION}/createnetwork"),
    ("Get Network References",       f"/network/{VERSION}/getnetworkreferences"),
    # WiFi Broadcasts
    ("Get Wifi Broadcast Details",   f"/network/{VERSION}/getwifibroadcastdetails"),
    ("Update Wifi Broadcast",        f"/network/{VERSION}/updatewifibroadcast"),
    ("Delete Wifi Broadcast",        f"/network/{VERSION}/deletewifibroadcast"),
    ("List Wifi Broadcasts",         f"/network/{VERSION}/getwifibroadcastpage"),
    ("Create Wifi Broadcast",        f"/network/{VERSION}/createwifibroadcast"),
    # Hotspot
    ("List Vouchers",                f"/network/{VERSION}/getvouchers"),
    ("Generate Vouchers",            f"/network/{VERSION}/createvouchers"),
    ("Delete Vouchers",              f"/network/{VERSION}/deletevouchers"),
    ("Get Voucher Details",          f"/network/{VERSION}/getvoucher"),
    ("Delete Voucher",               f"/network/{VERSION}/deletevoucher"),
    # Firewall
    ("Get Firewall Zone",            f"/network/{VERSION}/getfirewallzone"),
    ("Update Firewall Zone",         f"/network/{VERSION}/updatefirewallzone"),
    ("Delete Firewall Zone",         f"/network/{VERSION}/deletefirewallzone"),
    ("Get Firewall Policy",          f"/network/{VERSION}/getfirewallpolicy"),
    ("Update Firewall Policy",       f"/network/{VERSION}/updatefirewallpolicy"),
    ("Delete Firewall Policy",       f"/network/{VERSION}/deletefirewallpolicy"),
    ("Patch Firewall Policy",        f"/network/{VERSION}/patchfirewallpolicy"),
    ("Get Firewall Policy Ordering", f"/network/{VERSION}/getfirewallpolicyordering"),
    ("Reorder Firewall Policies",    f"/network/{VERSION}/updatefirewallpolicyordering"),
    ("List Firewall Zones",          f"/network/{VERSION}/getfirewallzones"),
    ("Create Firewall Zone",         f"/network/{VERSION}/createfirewallzone"),
    ("List Firewall Policies",       f"/network/{VERSION}/getfirewallpolicies"),
    ("Create Firewall Policy",       f"/network/{VERSION}/createfirewallpolicy"),
    # ACL
    ("Get ACL Rule",                 f"/network/{VERSION}/getaclrule"),
    ("Update ACL Rule",              f"/network/{VERSION}/updateaclrule"),
    ("Delete ACL Rule",              f"/network/{VERSION}/deleteaclrule"),
    ("Get ACL Rule Ordering",        f"/network/{VERSION}/getaclruleordering"),
    ("Reorder ACL Rules",            f"/network/{VERSION}/updateaclruleordering"),
    ("List ACL Rules",               f"/network/{VERSION}/getaclrulepage"),
    ("Create ACL Rule",              f"/network/{VERSION}/createaclrule"),
    # DNS Policies
    ("Get DNS Policy",               f"/network/{VERSION}/getdnspolicy"),
    ("Update DNS Policy",            f"/network/{VERSION}/updatednspolicy"),
    ("Delete DNS Policy",            f"/network/{VERSION}/deletednspolicy"),
    ("List DNS Policies",            f"/network/{VERSION}/getdnspolicypage"),
    ("Create DNS Policy",            f"/network/{VERSION}/creatednspolicy"),
    # Traffic Matching Lists
    ("Get Traffic Matching List",    f"/network/{VERSION}/gettrafficmatchinglist"),
    ("Update Traffic Matching List", f"/network/{VERSION}/updatetrafficmatchinglist"),
    ("Delete Traffic Matching List", f"/network/{VERSION}/deletetrafficmatchinglist"),
    ("List Traffic Matching Lists",  f"/network/{VERSION}/gettrafficmatchinglists"),
    ("Create Traffic Matching List", f"/network/{VERSION}/createtrafficmatchinglist"),
    # Supporting Resources
    ("List WAN Interfaces",          f"/network/{VERSION}/getwansoverviewpage"),
    ("List Site-To-Site VPN",        f"/network/{VERSION}/getsitetositevpntunnelpage"),
    ("List VPN Servers",             f"/network/{VERSION}/getvpnserverpage"),
    ("List Radius Profiles",         f"/network/{VERSION}/getradiusprofileoverviewpage"),
    ("List Device Tags",             f"/network/{VERSION}/getdevicetagpage"),
    ("List DPI App Categories",      f"/network/{VERSION}/getdpiapplicationcategories"),
    ("List DPI Applications",        f"/network/{VERSION}/getdpiapplications"),
    ("List Countries",               f"/network/{VERSION}/getcountries"),
    # Ansible
    ("Ansible Quick Start",          f"/network/{VERSION}/quick_start.ansible"),
]

SECTION_MAP = [
    ("Getting Started",              "General"),
    ("Filtering",                    "General"),
    ("Error Handling",               "General"),
    ("Connector -",                  "Cloud Connector"),
    ("Get Application Info",         "Application Info"),
    ("List Local Sites",             "Sites"),
    ("List Adopted Devices",         "UniFi Devices"),
    ("Adopt Devices",                "UniFi Devices"),
    ("Execute Port Action",          "UniFi Devices"),
    ("Execute Device Action",        "UniFi Devices"),
    ("Get Adopted Device Details",   "UniFi Devices"),
    ("Remove Device",                "UniFi Devices"),
    ("Get Device Statistics",        "UniFi Devices"),
    ("List Pending Devices",         "UniFi Devices"),
    ("Execute Client Action",        "Clients"),
    ("List Connected Clients",       "Clients"),
    ("Get Client Details",           "Clients"),
    ("Network",                      "Networks"),
    ("Wifi Broadcast",               "WiFi"),
    ("Wifi",                         "WiFi"),
    ("Voucher",                      "Hotspot"),
    ("Vouchers",                     "Hotspot"),
    ("Firewall",                     "Firewall"),
    ("ACL",                          "Access Control"),
    ("DNS",                          "DNS Policies"),
    ("Traffic Matching",             "Traffic Matching Lists"),
    ("WAN",                          "Supporting Resources"),
    ("VPN",                          "Supporting Resources"),
    ("Radius",                       "Supporting Resources"),
    ("Device Tag",                   "Supporting Resources"),
    ("DPI",                          "Supporting Resources"),
    ("Countries",                    "Supporting Resources"),
    ("Ansible",                      "Ansible"),
]


@dataclass
class EndpointDoc:
    title: str
    slug: str
    url: str
    method: str = ""
    api_path: str = ""
    summary: str = ""
    description: str = ""
    path_params: list[dict] = field(default_factory=list)
    query_params: list[dict] = field(default_factory=list)
    request_body_schema: dict = field(default_factory=dict)
    response_schema: dict = field(default_factory=dict)
    error: str = ""


def fetch_html(url: str, retries: int = 3) -> str | None:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.5",
    }
    req = urllib.request.Request(url, headers=headers)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


def extract_endpoint_from_rsc(html: str) -> dict | None:
    """
    Extract the endpoint OpenAPI object from RSC (React Server Component) push payloads.
    The data lives in: self.__next_f.push([1, "...{\"endpoint\":{...}}..."]) calls.
    """
    # Find all type-1 push payloads (RSC data)
    pushes = re.findall(r'self\.__next_f\.push\(\[1,(.*?)\]\s*\)', html, re.DOTALL)

    for raw in pushes:
        # The payload is a JSON string (quoted). Unescape it.
        try:
            # Strip leading/trailing quote
            if raw.startswith('"') and raw.endswith('"'):
                unescaped = json.loads(raw)  # parse the outer JSON string
            else:
                unescaped = raw
        except Exception:
            unescaped = raw

        # Look for "endpoint":{ pattern
        m = re.search(r'"endpoint"\s*:\s*(\{)', unescaped)
        if not m:
            continue

        # Find the matching closing brace
        start = m.start(1)
        depth = 0
        end = start
        for i, ch in enumerate(unescaped[start:], start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break

        try:
            endpoint_json = unescaped[start:end]
            return json.loads(endpoint_json)
        except json.JSONDecodeError:
            continue

    return None


def extract_schema_example(schema: dict, _depth: int = 0) -> Any:
    """Build a representative example value from a JSON Schema object."""
    if _depth > 8 or not isinstance(schema, dict):
        return None

    # Prefer explicit examples
    if "example" in schema:
        return schema["example"]
    if "examples" in schema and isinstance(schema["examples"], list) and schema["examples"]:
        return schema["examples"][0]

    # Handle allOf / oneOf / anyOf
    for combiner in ("allOf", "anyOf", "oneOf"):
        if combiner in schema and schema[combiner]:
            return extract_schema_example(schema[combiner][0], _depth + 1)

    schema_type = schema.get("type")

    if schema_type == "object" or "properties" in schema:
        result = {}
        for prop, prop_schema in (schema.get("properties") or {}).items():
            val = extract_schema_example(prop_schema, _depth + 1)
            if val is not None:
                result[prop] = val
        return result or None

    if schema_type == "array":
        item = extract_schema_example(schema.get("items") or {}, _depth + 1)
        return [item] if item is not None else []

    if schema_type == "string":
        enum = schema.get("enum")
        if enum:
            return enum[0]
        fmt = schema.get("format", "")
        if fmt == "uuid":
            return "00000000-0000-0000-0000-000000000000"
        if fmt == "date-time":
            return "2024-01-01T00:00:00Z"
        return schema.get("default", "string")

    if schema_type == "integer":
        return schema.get("default", 0)
    if schema_type == "number":
        return schema.get("default", 0.0)
    if schema_type == "boolean":
        return schema.get("default", True)

    return None


def build_curl(method: str, api_path: str, req_example: Any) -> tuple[str, str]:
    """Return (local_curl, cloud_curl). api_path already starts with /v1/..."""
    if not method or not api_path:
        return "", ""

    m = method.upper()

    # Local: direct to controller via proxy prefix
    local_url = f"https://192.168.1.1/proxy/network/integration{api_path}"
    # Cloud: via api.ui.com connector (replace /v1/sites/{siteId} with cloud path structure)
    cloud_url = f"https://api.ui.com/proxy/network/integration{api_path}"

    def _curl(url: str, extra_headers: list[str] | None = None) -> str:
        lines = [
            f"curl -sS -L \\",
            f'  -X {m} "{url}" \\',
            f'  -H "Accept: application/json" \\',
            f'  -H "X-API-Key: <your-api-key>"',
        ]
        for h in (extra_headers or []):
            lines[-1] += " \\"
            lines.append(f"  {h}")
        if req_example and m in ("POST", "PUT", "PATCH"):
            body = json.dumps(req_example, indent=2)
            lines[-1] += " \\"
            lines.append(f'  -H "Content-Type: application/json" \\')
            lines.append(f"  -d '{body}'")
        return "\n".join(lines)

    return _curl(local_url), _curl(cloud_url)


def parse_params(parameters: list[dict]) -> tuple[list[dict], list[dict]]:
    path_params, query_params = [], []
    for p in (parameters or []):
        info = {
            "name": p.get("name", ""),
            "required": p.get("required", False),
            "description": p.get("description", ""),
            "type": (p.get("schema") or {}).get("type", "string"),
        }
        loc = p.get("in", "")
        if loc == "path":
            path_params.append(info)
        elif loc == "query":
            query_params.append(info)
    return path_params, query_params


def get_response_schema(responses: dict) -> dict:
    for code in sorted(responses.keys()):
        if str(code).startswith("2"):
            content = (responses[code] or {}).get("content") or {}
            for mime, mime_data in content.items():
                if "json" in mime:
                    return (mime_data or {}).get("schema") or {}
    return {}


def get_request_body_schema(request_body: dict) -> dict:
    content = (request_body or {}).get("content") or {}
    for mime, mime_data in content.items():
        if "json" in mime:
            return (mime_data or {}).get("schema") or {}
    return {}


def scrape_page(title: str, slug: str) -> EndpointDoc:
    url = BASE + slug
    doc = EndpointDoc(title=title, slug=slug, url=url)

    html = fetch_html(url)
    if not html:
        doc.error = "Failed to fetch page"
        return doc

    endpoint = extract_endpoint_from_rsc(html)
    if not endpoint:
        doc.error = "No endpoint data found (may be a docs/info page)"
        return doc

    doc.method = (endpoint.get("method") or "").upper()
    doc.api_path = endpoint.get("path") or ""
    doc.summary = endpoint.get("summary") or ""
    doc.description = endpoint.get("description") or ""

    doc.path_params, doc.query_params = parse_params(endpoint.get("parameters") or [])
    doc.request_body_schema = get_request_body_schema(endpoint.get("requestBody") or {})
    doc.response_schema = get_response_schema(endpoint.get("responses") or {})

    return doc


def get_section(title: str) -> str:
    for key, sec in SECTION_MAP:
        if key in title:
            return sec
    return "Other"


def render_markdown(docs: list[EndpointDoc]) -> str:
    lines = [
        f"# UniFi Network API Reference ({VERSION})",
        "",
        f"> Source: {BASE}/network/{VERSION}",
        ">",
        "> **Auth:** Add `X-API-Key: <your-api-key>` header to every request.",
        "> Generate the key in UniFi OS → Settings → Control Plane → Integrations.",
        ">",
        "> **Base URL (local):** `https://<controller-ip>/proxy/network/integration/v1/...`",
        ">",
        "> **Base URL (cloud):** `https://api.ui.com/proxy/network/integration/v1/...`",
        "",
        "---",
        "",
    ]

    current_section = ""

    for doc in docs:
        section = get_section(doc.title)
        if section != current_section:
            lines += ["", f"## {section}", ""]
            current_section = section

        anchor = doc.slug.rsplit("/", 1)[-1]
        lines += [f"### {doc.title}", ""]
        lines += [f"**Docs:** {doc.url}", ""]

        if doc.error and not doc.method:
            lines += [f"> ℹ️ {doc.error}", "", "---", ""]
            continue

        lines += [f"```\n{doc.method} /proxy/network/integration{doc.api_path}\n```", ""]

        if doc.summary:
            lines += [f"**{doc.summary}**", ""]

        # Strip HTML from description
        desc = re.sub(r'<[^>]+>', '', doc.description or "").strip()
        # Only show first paragraph (before \n\n)
        desc = desc.split("\n\n")[0].strip()
        if desc:
            lines += [desc, ""]

        if doc.path_params:
            lines += ["**Path Parameters:**", ""]
            lines += ["| Name | Required | Type | Description |",
                      "|------|:--------:|------|-------------|"]
            for p in doc.path_params:
                req = "✓" if p["required"] else ""
                lines.append(f"| `{p['name']}` | {req} | `{p['type']}` | {p['description']} |")
            lines.append("")

        if doc.query_params:
            lines += ["**Query Parameters:**", ""]
            lines += ["| Name | Required | Type | Description |",
                      "|------|:--------:|------|-------------|"]
            for p in doc.query_params:
                req = "✓" if p["required"] else ""
                lines.append(f"| `{p['name']}` | {req} | `{p['type']}` | {p['description']} |")
            lines.append("")

        if doc.request_body_schema:
            example = extract_schema_example(doc.request_body_schema)
            if example:
                lines += ["**Request Body:**",
                          "```json",
                          json.dumps(example, indent=2),
                          "```", ""]

        if doc.response_schema:
            example = extract_schema_example(doc.response_schema)
            if example:
                lines += ["**Response:**",
                          "```json",
                          json.dumps(example, indent=2),
                          "```", ""]

        # curl examples
        req_example = extract_schema_example(doc.request_body_schema) if doc.request_body_schema else None
        curl_local, curl_cloud = build_curl(doc.method, doc.api_path, req_example)
        if curl_local:
            lines += ["**curl (local — direct to controller):**", "```bash", curl_local, "```", ""]
        if curl_cloud:
            lines += ["**curl (cloud — via api.ui.com):**", "```bash", curl_cloud, "```", ""]

        lines += ["---", ""]

    return "\n".join(lines)


def main() -> None:
    import os
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "unifi_api_docs.md")

    print(f"Scraping {len(PAGES)} pages from {BASE} ...")
    docs: list[EndpointDoc] = []

    for i, (title, slug) in enumerate(PAGES, 1):
        print(f"  [{i:02d}/{len(PAGES)}] {title} ...", end=" ", flush=True)
        doc = scrape_page(title, slug)
        docs.append(doc)

        if doc.method:
            print(f"✓  {doc.method} {doc.api_path}")
        elif doc.error:
            print(f"–  {doc.error}")
        else:
            print("?")

        time.sleep(0.3)

    md = render_markdown(docs)
    with open(out_path, "w") as f:
        f.write(md)

    success = sum(1 for d in docs if d.method)
    print(f"\nDone. {success}/{len(docs)} endpoints extracted.")
    print(f"Output: {out_path}")


if __name__ == "__main__":
    main()

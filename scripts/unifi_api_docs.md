# UniFi Network API Reference (v10.1.84)

> Source: https://developer.ui.com/network/v10.1.84
>
> **Auth:** Add `X-API-Key: <your-api-key>` header to every request.
> Generate the key in UniFi OS → Settings → Control Plane → Integrations.
>
> **Base URL (local):** `https://<controller-ip>/proxy/network/integration/v1/...`
>
> **Base URL (cloud):** `https://api.ui.com/proxy/network/integration/v1/...`

---


## General

### Getting Started

**Docs:** https://developer.ui.com/network/v10.1.84/gettingstarted

> ℹ️ No endpoint data found (may be a docs/info page)

---

### Filtering

**Docs:** https://developer.ui.com/network/v10.1.84/filtering

> ℹ️ No endpoint data found (may be a docs/info page)

---

### Error Handling

**Docs:** https://developer.ui.com/network/v10.1.84/error-handling

> ℹ️ No endpoint data found (may be a docs/info page)

---


## Cloud Connector

### Connector - POST

**Docs:** https://developer.ui.com/network/v10.1.84/connectorpost

```
POST /proxy/network/integration/v1/connector/consoles/{id}/*path
```

**Connector - POST**

Forward POST requests to UniFi applications using RESTful HTTP methods. **Request Flow**: The request is proxied through `api.ui.com` cloud endpoint to the remote console at `http://127.0.0.1/proxy/[path]` with POST method. **Requirements**: - Console firmware version must >= 5.0.3- For non-organization API keys: Limited to API key owner's consoles only (cannot access other admins' consoles)- For organization API keys: Can access any console within the organization**API Documentation**: - Network API: [https://developer.ui.com/network](https://developer.ui.com/network)- Protect API: [https://developer.ui.com/protect](https://developer.ui.com/protect)**Response**: On success, the upstream API response is passed through directly. On error, a standardized error schema is returned.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `id` | ✓ | `string` | Host ID to proxy the request to |
| `path` | ✓ | `string` | API path to proxy |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Connector - GET

**Docs:** https://developer.ui.com/network/v10.1.84/connectorget

```
GET /proxy/network/integration/v1/connector/consoles/{id}/*path
```

**Connector - GET**

$1a

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `id` | ✓ | `string` | Host ID to proxy the request to |
| `path` | ✓ | `string` | API path to proxy |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Connector - PUT

**Docs:** https://developer.ui.com/network/v10.1.84/connectorput

```
PUT /proxy/network/integration/v1/connector/consoles/{id}/*path
```

**Connector - PUT**

Forward PUT requests to UniFi applications using RESTful HTTP methods. **Request Flow**: The request is proxied through `api.ui.com` cloud endpoint to the remote console at `http://127.0.0.1/proxy/[path]` with PUT method. **Requirements**: - Console firmware version must >= 5.0.3- For non-organization API keys: Limited to API key owner's consoles only (cannot access other admins' consoles)- For organization API keys: Can access any console within the organization**API Documentation**: - Network API: [https://developer.ui.com/network](https://developer.ui.com/network)- Protect API: [https://developer.ui.com/protect](https://developer.ui.com/protect)**Response**: On success, the upstream API response is passed through directly. On error, a standardized error schema is returned.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `id` | ✓ | `string` | Host ID to proxy the request to |
| `path` | ✓ | `string` | API path to proxy |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Connector - DELETE

**Docs:** https://developer.ui.com/network/v10.1.84/connectordelete

```
DELETE /proxy/network/integration/v1/connector/consoles/{id}/*path
```

**Connector - DELETE**

Forward DELETE requests to UniFi applications using RESTful HTTP methods. **Request Flow**: The request is proxied through `api.ui.com` cloud endpoint to the remote console at `http://127.0.0.1/proxy/[path]` with DELETE method. **Requirements**: - Console firmware version must >= 5.0.3- For non-organization API keys: Limited to API key owner's consoles only (cannot access other admins' consoles)- For organization API keys: Can access any console within the organization**API Documentation**: - Network API: [https://developer.ui.com/network](https://developer.ui.com/network)- Protect API: [https://developer.ui.com/protect](https://developer.ui.com/protect)**Response**: On success, the upstream API response is passed through directly. On error, a standardized error schema is returned.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `id` | ✓ | `string` | Host ID to proxy the request to |
| `path` | ✓ | `string` | API path to proxy |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Connector - PATCH

**Docs:** https://developer.ui.com/network/v10.1.84/connectorpatch

```
PATCH /proxy/network/integration/v1/connector/consoles/{id}/*path
```

**Connector - PATCH**

Forward PATCH requests to UniFi applications using RESTful HTTP methods. **Request Flow**: The request is proxied through `api.ui.com` cloud endpoint to the remote console at `http://127.0.0.1/proxy/[path]` with PATCH method. **Requirements**: - Console firmware version must >= 5.0.3- For non-organization API keys: Limited to API key owner's consoles only (cannot access other admins' consoles)- For organization API keys: Can access any console within the organization**API Documentation**: - Network API: [https://developer.ui.com/network](https://developer.ui.com/network)- Protect API: [https://developer.ui.com/protect](https://developer.ui.com/protect)**Response**: On success, the upstream API response is passed through directly. On error, a standardized error schema is returned.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `id` | ✓ | `string` | Host ID to proxy the request to |
| `path` | ✓ | `string` | API path to proxy |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PATCH "https://192.168.1.1/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PATCH "https://api.ui.com/proxy/network/integration/v1/connector/consoles/{id}/*path" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## Application Info

### Get Application Info

**Docs:** https://developer.ui.com/network/v10.1.84/getinfo

```
GET /proxy/network/integration/v1/info
```

**Get Application Info**

Retrieve general information about the UniFi Network application.

**Response:**
```json
{
  "applicationVersion": "9.1.0"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/info" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/info" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## Sites

### List Local Sites

**Docs:** https://developer.ui.com/network/v10.1.84/getsiteoverviewpage

```
GET /proxy/network/integration/v1/sites
```

**List Local Sites**

Retrieve a paginated list of local sites managed by this Network application.
Site ID is required for other UniFi Network API calls.

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "internalReference": "string",
      "name": "string"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## UniFi Devices

### List Adopted Devices

**Docs:** https://developer.ui.com/network/v10.1.84/getadopteddeviceoverviewpage

```
GET /proxy/network/integration/v1/sites/{siteId}/devices
```

**List Adopted Devices**

Retrieve a paginated list of all adopted devices on a site, including basic device information.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "macAddress": "94:2a:6f:26:c6:ca",
      "ipAddress": "192.168.1.55",
      "name": "IW HD",
      "model": "UHDIW",
      "state": "ONLINE",
      "supported": true,
      "firmwareVersion": "6.6.55",
      "firmwareUpdatable": true,
      "features": [
        "switching"
      ],
      "interfaces": [
        "ports"
      ]
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Adopt Devices

**Docs:** https://developer.ui.com/network/v10.1.84/adoptdevice

```
POST /proxy/network/integration/v1/sites/{siteId}/devices
```

**Adopt Devices**

Adopt a device to a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "macAddress": "string",
  "ignoreDeviceLimit": true
}
```

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "macAddress": "94:2a:6f:26:c6:ca",
  "ipAddress": "192.168.1.55",
  "name": "IW HD",
  "model": "UHDIW",
  "supported": true,
  "state": "ONLINE",
  "firmwareVersion": "6.6.55",
  "firmwareUpdatable": true,
  "adoptedAt": "2024-01-01T00:00:00Z",
  "provisionedAt": "2024-01-01T00:00:00Z",
  "configurationId": "7596498d2f367dc2",
  "uplink": {
    "deviceId": "00000000-0000-0000-0000-000000000000"
  },
  "features": {
    "switching": {},
    "accessPoint": {}
  },
  "interfaces": {
    "ports": [
      {
        "idx": 1,
        "state": "UP",
        "connector": "RJ45",
        "maxSpeedMbps": 10000,
        "speedMbps": 1000,
        "poe": {
          "standard": "802.3bt",
          "type": 3,
          "enabled": true,
          "state": "UP"
        }
      }
    ],
    "radios": [
      {
        "wlanStandard": "802.11a",
        "frequencyGHz": 0.0,
        "channelWidthMHz": 40,
        "channel": 36
      }
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "macAddress": "string",
  "ignoreDeviceLimit": true
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "macAddress": "string",
  "ignoreDeviceLimit": true
}'
```

---

### Execute Port Action

**Docs:** https://developer.ui.com/network/v10.1.84/executeportaction

```
POST /proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/interfaces/ports/{portIdx}/actions
```

**Execute Port Action**

Perform an action on a specific device port. The request body must include the action name and any applicable input arguments.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `portIdx` | ✓ | `integer` |  |
| `siteId` | ✓ | `string` |  |
| `deviceId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "action": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/interfaces/ports/{portIdx}/actions" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "action": "string"
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/interfaces/ports/{portIdx}/actions" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "action": "string"
}'
```

---

### Execute Device Action

**Docs:** https://developer.ui.com/network/v10.1.84/executeadopteddeviceaction

```
POST /proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/actions
```

**Execute Adopted Device Action**

Perform an action on an specific adopted device. The request body must include the action name and any applicable input arguments.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |
| `deviceId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "action": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/actions" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "action": "string"
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/actions" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "action": "string"
}'
```

---

### Get Adopted Device Details

**Docs:** https://developer.ui.com/network/v10.1.84/getadopteddevicedetails

```
GET /proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}
```

**Get Adopted Device Details**

Retrieve detailed information about a specific adopted device, including firmware versioning, uplink state, details about device features and interfaces (ports, radios) and other key attributes.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |
| `deviceId` | ✓ | `string` |  |

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "macAddress": "94:2a:6f:26:c6:ca",
  "ipAddress": "192.168.1.55",
  "name": "IW HD",
  "model": "UHDIW",
  "supported": true,
  "state": "ONLINE",
  "firmwareVersion": "6.6.55",
  "firmwareUpdatable": true,
  "adoptedAt": "2024-01-01T00:00:00Z",
  "provisionedAt": "2024-01-01T00:00:00Z",
  "configurationId": "7596498d2f367dc2",
  "uplink": {
    "deviceId": "00000000-0000-0000-0000-000000000000"
  },
  "features": {
    "switching": {},
    "accessPoint": {}
  },
  "interfaces": {
    "ports": [
      {
        "idx": 1,
        "state": "UP",
        "connector": "RJ45",
        "maxSpeedMbps": 10000,
        "speedMbps": 1000,
        "poe": {
          "standard": "802.3bt",
          "type": 3,
          "enabled": true,
          "state": "UP"
        }
      }
    ],
    "radios": [
      {
        "wlanStandard": "802.11a",
        "frequencyGHz": 0.0,
        "channelWidthMHz": 40,
        "channel": 36
      }
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Remove Device

**Docs:** https://developer.ui.com/network/v10.1.84/removedevice

```
DELETE /proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}
```

**Remove (Unadopt) Device**

Removes (unadopts) an adopted device from the site. If the device is online, it will be reset to factory defaults.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |
| `deviceId` | ✓ | `string` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Get Device Statistics

**Docs:** https://developer.ui.com/network/v10.1.84/getadopteddevicelateststatistics

```
GET /proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/statistics/latest
```

**Get Latest Adopted Device Statistics**

Retrieve the latest real-time statistics of a specific adopted device, such as uptime, data transmission rates, CPU and memory utilization.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |
| `deviceId` | ✓ | `string` |  |

**Response:**
```json
{
  "uptimeSec": 0,
  "lastHeartbeatAt": "2024-01-01T00:00:00Z",
  "nextHeartbeatAt": "2024-01-01T00:00:00Z",
  "loadAverage1Min": 0.0,
  "loadAverage5Min": 0.0,
  "loadAverage15Min": 0.0,
  "cpuUtilizationPct": 0.0,
  "memoryUtilizationPct": 0.0,
  "uplink": {
    "txRateBps": 0,
    "rxRateBps": 0
  },
  "interfaces": {
    "radios": [
      {
        "frequencyGHz": 0.0,
        "txRetriesPct": 0.0
      }
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/statistics/latest" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/statistics/latest" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Pending Devices

**Docs:** https://developer.ui.com/network/v10.1.84/getpendingdevicepage

```
GET /proxy/network/integration/v1/pending-devices
```

**List Devices Pending Adoption**

Retrieve a paginated list of devices pending adoption, including basic device information.

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "macAddress": "94:2a:6f:26:c6:ca",
      "ipAddress": "192.168.1.55",
      "model": "UHDIW",
      "state": "ONLINE",
      "supported": true,
      "firmwareVersion": "6.6.55",
      "firmwareUpdatable": true,
      "features": [
        "switching"
      ],
      "adoptionTargetSiteIds": [
        "00000000-0000-0000-0000-000000000000"
      ]
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/pending-devices" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/pending-devices" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## Clients

### Execute Client Action

**Docs:** https://developer.ui.com/network/v10.1.84/executeconnectedclientaction

```
POST /proxy/network/integration/v1/sites/{siteId}/clients/{clientId}/actions
```

**Execute Client Action**

Perform an action on a specific connected client. The request body must include the action name and any applicable input arguments.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `clientId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "action": "string"
}
```

**Response:**
```json
{
  "action": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/clients/{clientId}/actions" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "action": "string"
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/clients/{clientId}/actions" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "action": "string"
}'
```

---

### List Connected Clients

**Docs:** https://developer.ui.com/network/v10.1.84/getconnectedclientoverviewpage

```
GET /proxy/network/integration/v1/sites/{siteId}/clients
```

**List Connected Clients**

Retrieve a paginated list of all connected clients on a site, including physical devices (computers, smartphones) and active VPN connections.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "string",
      "connectedAt": "2024-01-01T00:00:00Z",
      "ipAddress": "string",
      "access": {
        "type": "DEFAULT"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/clients" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/clients" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Get Client Details

**Docs:** https://developer.ui.com/network/v10.1.84/getconnectedclientdetails

```
GET /proxy/network/integration/v1/sites/{siteId}/clients/{clientId}
```

**Get Connected Client Details**

Retrieve detailed information about a specific connected client, including name, IP address, MAC address, connection type and access information.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `clientId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "string",
  "connectedAt": "2024-01-01T00:00:00Z",
  "ipAddress": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/clients/{clientId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/clients/{clientId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## Networks

### Get Network Details

**Docs:** https://developer.ui.com/network/v10.1.84/getnetworkdetails

```
GET /proxy/network/integration/v1/sites/{siteId}/networks/{networkId}
```

**Get Network Details**

Retrieve detailed information about a specific network.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `networkId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "management": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "metadata": {
    "origin": "string"
  },
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  },
  "default": true
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update Network

**Docs:** https://developer.ui.com/network/v10.1.84/updatenetwork

```
PUT /proxy/network/integration/v1/sites/{siteId}/networks/{networkId}
```

**Update Network**

Update an existing network on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `networkId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "management": "string",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  }
}
```

**Response:**
```json
{
  "management": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "metadata": {
    "origin": "string"
  },
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  },
  "default": true
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "management": "string",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "management": "string",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  }
}'
```

---

### Delete Network

**Docs:** https://developer.ui.com/network/v10.1.84/deletenetwork

```
DELETE /proxy/network/integration/v1/sites/{siteId}/networks/{networkId}
```

**Delete Network**

Delete an existing network on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `networkId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `force` |  | `boolean` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Networks

**Docs:** https://developer.ui.com/network/v10.1.84/getnetworksoverviewpage

```
GET /proxy/network/integration/v1/sites/{siteId}/networks
```

**List Networks**

Retrieve a paginated list of all Networks on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "management": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "Default Network",
      "enabled": true,
      "vlanId": 0,
      "metadata": {
        "origin": "string"
      },
      "default": true
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/networks" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/networks" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create Network

**Docs:** https://developer.ui.com/network/v10.1.84/createnetwork

```
POST /proxy/network/integration/v1/sites/{siteId}/networks
```

**Create Network**

Create a new network on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "management": "string",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  }
}
```

**Response:**
```json
{
  "management": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "metadata": {
    "origin": "string"
  },
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  },
  "default": true
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/networks" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "management": "string",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/networks" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "management": "string",
  "name": "Default Network",
  "enabled": true,
  "vlanId": 0,
  "dhcpGuarding": {
    "trustedDhcpServerIpAddresses": [
      "string"
    ]
  }
}'
```

---

### Get Network References

**Docs:** https://developer.ui.com/network/v10.1.84/getnetworkreferences

```
GET /proxy/network/integration/v1/sites/{siteId}/networks/{networkId}/references
```

**Get Network References**

Retrieve references to a specific network.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `networkId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "referenceResources": [
    {
      "resourceType": "CLIENT",
      "referenceCount": 0,
      "references": [
        {
          "referenceId": "00000000-0000-0000-0000-000000000000"
        }
      ]
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}/references" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/networks/{networkId}/references" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## WiFi

### Get Wifi Broadcast Details

**Docs:** https://developer.ui.com/network/v10.1.84/getwifibroadcastdetails

```
GET /proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}
```

**Get Wifi Broadcast Details**

Retrieve detailed information about a specific Wifi.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `wifiBroadcastId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "string",
  "metadata": {
    "origin": "string"
  },
  "enabled": true,
  "network": {
    "type": "string"
  },
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update Wifi Broadcast

**Docs:** https://developer.ui.com/network/v10.1.84/updatewifibroadcast

```
PUT /proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}
```

**Update Wifi Broadcast**

Update an existing Wifi Broadcast on the specified site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `wifiBroadcastId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "name": "string",
  "network": {
    "type": "string"
  },
  "enabled": true,
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}
```

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "string",
  "metadata": {
    "origin": "string"
  },
  "enabled": true,
  "network": {
    "type": "string"
  },
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "string",
  "network": {
    "type": "string"
  },
  "enabled": true,
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "string",
  "network": {
    "type": "string"
  },
  "enabled": true,
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}'
```

---

### Delete Wifi Broadcast

**Docs:** https://developer.ui.com/network/v10.1.84/deletewifibroadcast

```
DELETE /proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}
```

**Delete Wifi Broadcast**

Delete an existing Wifi Broadcast from the specified site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `wifiBroadcastId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `force` |  | `boolean` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Wifi Broadcasts

**Docs:** https://developer.ui.com/network/v10.1.84/getwifibroadcastpage

```
GET /proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts
```

**List Wifi Broadcasts**

$1a

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "string",
      "enabled": true,
      "metadata": {
        "origin": "string"
      },
      "network": {
        "type": "string"
      },
      "securityConfiguration": {
        "type": "string"
      },
      "broadcastingDeviceFilter": {
        "type": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create Wifi Broadcast

**Docs:** https://developer.ui.com/network/v10.1.84/createwifibroadcast

```
POST /proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts
```

**Create Wifi Broadcast**

Create a new Wifi Broadcast on the specified site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "name": "string",
  "network": {
    "type": "string"
  },
  "enabled": true,
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}
```

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "string",
  "metadata": {
    "origin": "string"
  },
  "enabled": true,
  "network": {
    "type": "string"
  },
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "string",
  "network": {
    "type": "string"
  },
  "enabled": true,
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/wifi/broadcasts" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "string",
  "network": {
    "type": "string"
  },
  "enabled": true,
  "securityConfiguration": {
    "type": "string"
  },
  "broadcastingDeviceFilter": {
    "type": "string"
  },
  "mdnsProxyConfiguration": {
    "mode": "string"
  },
  "multicastFilteringPolicy": {
    "action": "string"
  },
  "multicastToUnicastConversionEnabled": true,
  "clientIsolationEnabled": true,
  "hideName": true,
  "uapsdEnabled": true,
  "basicDataRateKbpsByFrequencyGHz": {
    "5": 6000,
    "2.4": 2000
  },
  "clientFilteringPolicy": {
    "action": "ALLOW",
    "macAddressFilter": [
      "string"
    ]
  },
  "blackoutScheduleConfiguration": {
    "days": [
      {
        "type": "string",
        "day": "SUN"
      }
    ]
  }
}'
```

---


## Hotspot

### List Vouchers

**Docs:** https://developer.ui.com/network/v10.1.84/getvouchers

```
GET /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers
```

**List Vouchers**

Retrieve a paginated list of Hotspot vouchers.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "createdAt": "2024-01-01T00:00:00Z",
      "name": "hotel-guest",
      "code": 4861409510,
      "authorizedGuestLimit": 1,
      "authorizedGuestCount": 0,
      "activatedAt": "2024-01-01T00:00:00Z",
      "expiresAt": "2024-01-01T00:00:00Z",
      "expired": true,
      "timeLimitMinutes": 1440,
      "dataUsageLimitMBytes": 1024,
      "rxRateLimitKbps": 1000,
      "txRateLimitKbps": 1000
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Generate Vouchers

**Docs:** https://developer.ui.com/network/v10.1.84/createvouchers

```
POST /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers
```

**Generate Vouchers**

Create one or more Hotspot vouchers.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "count": 1,
  "name": "string",
  "authorizedGuestLimit": 1,
  "timeLimitMinutes": 0,
  "dataUsageLimitMBytes": 0,
  "rxRateLimitKbps": 0,
  "txRateLimitKbps": 0
}
```

**Response:**
```json
{
  "vouchers": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "createdAt": "2024-01-01T00:00:00Z",
      "name": "hotel-guest",
      "code": 4861409510,
      "authorizedGuestLimit": 1,
      "authorizedGuestCount": 0,
      "activatedAt": "2024-01-01T00:00:00Z",
      "expiresAt": "2024-01-01T00:00:00Z",
      "expired": true,
      "timeLimitMinutes": 1440,
      "dataUsageLimitMBytes": 1024,
      "rxRateLimitKbps": 1000,
      "txRateLimitKbps": 1000
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "count": 1,
  "name": "string",
  "authorizedGuestLimit": 1,
  "timeLimitMinutes": 0,
  "dataUsageLimitMBytes": 0,
  "rxRateLimitKbps": 0,
  "txRateLimitKbps": 0
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "count": 1,
  "name": "string",
  "authorizedGuestLimit": 1,
  "timeLimitMinutes": 0,
  "dataUsageLimitMBytes": 0,
  "rxRateLimitKbps": 0,
  "txRateLimitKbps": 0
}'
```

---

### Delete Vouchers

**Docs:** https://developer.ui.com/network/v10.1.84/deletevouchers

```
DELETE /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers
```

**Delete Vouchers**

Remove Hotspot vouchers based on the specified filter criteria.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `filter` | ✓ | `string` |  |

**Response:**
```json
{
  "vouchersDeleted": 0
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Get Voucher Details

**Docs:** https://developer.ui.com/network/v10.1.84/getvoucher

```
GET /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{voucherId}
```

**Get Voucher Details**

Retrieve details of a specific Hotspot voucher.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `voucherId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "createdAt": "2024-01-01T00:00:00Z",
  "name": "hotel-guest",
  "code": 4861409510,
  "authorizedGuestLimit": 1,
  "authorizedGuestCount": 0,
  "activatedAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2024-01-01T00:00:00Z",
  "expired": true,
  "timeLimitMinutes": 1440,
  "dataUsageLimitMBytes": 1024,
  "rxRateLimitKbps": 1000,
  "txRateLimitKbps": 1000
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{voucherId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{voucherId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Delete Voucher

**Docs:** https://developer.ui.com/network/v10.1.84/deletevoucher

```
DELETE /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{voucherId}
```

**Delete Voucher**

Remove a specific Hotspot voucher.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `voucherId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "vouchersDeleted": 0
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{voucherId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{voucherId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## Firewall

### Get Firewall Zone

**Docs:** https://developer.ui.com/network/v10.1.84/getfirewallzone

```
GET /proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}
```

**Get Firewall Zone**

Get a firewall zone on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallZoneId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ],
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update Firewall Zone

**Docs:** https://developer.ui.com/network/v10.1.84/updatefirewallzone

```
PUT /proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}
```

**Update Firewall Zone**

Update a firewall zone on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallZoneId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ]
}
```

**Response:**
```json
{
  "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ],
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ]
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ]
}'
```

---

### Delete Firewall Zone

**Docs:** https://developer.ui.com/network/v10.1.84/deletefirewallzone

```
DELETE /proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}
```

**Delete Custom Firewall Zone**

Delete a custom firewall zone from a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallZoneId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/zones/{firewallZoneId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Get Firewall Policy

**Docs:** https://developer.ui.com/network/v10.1.84/getfirewallpolicy

```
GET /proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}
```

**Get Firewall Policy**

Retrieve specific firewall policy.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "index": 0,
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  },
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update Firewall Policy

**Docs:** https://developer.ui.com/network/v10.1.84/updatefirewallpolicy

```
PUT /proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}
```

**Update Firewall Policy**

Update an existing firewall policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  }
}
```

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "index": 0,
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  },
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  }
}'
```

---

### Delete Firewall Policy

**Docs:** https://developer.ui.com/network/v10.1.84/deletefirewallpolicy

```
DELETE /proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}
```

**Delete Firewall Policy**

Delete an existing firewall policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Patch Firewall Policy

**Docs:** https://developer.ui.com/network/v10.1.84/patchfirewallpolicy

```
PATCH /proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}
```

**Patch Firewall Policy**

Patch an existing firewall policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `firewallPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "loggingEnabled": true
}
```

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "index": 0,
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  },
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PATCH "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "loggingEnabled": true
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PATCH "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "loggingEnabled": true
}'
```

---

### Get Firewall Policy Ordering

**Docs:** https://developer.ui.com/network/v10.1.84/getfirewallpolicyordering

```
GET /proxy/network/integration/v1/sites/{siteId}/firewall/policies/ordering
```

**Get User-Defined Firewall Policy Ordering**

Retrieve user-defined firewall policy ordering for a specific source/destination zone pair.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `sourceFirewallZoneId` | ✓ | `string` |  |
| `destinationFirewallZoneId` | ✓ | `string` |  |

**Response:**
```json
{
  "orderedFirewallPolicyIds": {
    "beforeSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ],
    "afterSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Reorder Firewall Policies

**Docs:** https://developer.ui.com/network/v10.1.84/updatefirewallpolicyordering

```
PUT /proxy/network/integration/v1/sites/{siteId}/firewall/policies/ordering
```

**Reorder User-Defined Firewall Policies**

Reorder user-defined firewall policies for a specific source/destination zone pair.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `sourceFirewallZoneId` | ✓ | `string` |  |
| `destinationFirewallZoneId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "orderedFirewallPolicyIds": {
    "beforeSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ],
    "afterSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ]
  }
}
```

**Response:**
```json
{
  "orderedFirewallPolicyIds": {
    "beforeSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ],
    "afterSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ]
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "orderedFirewallPolicyIds": {
    "beforeSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ],
    "afterSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ]
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "orderedFirewallPolicyIds": {
    "beforeSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ],
    "afterSystemDefined": [
      "00000000-0000-0000-0000-000000000000"
    ]
  }
}'
```

---

### List Firewall Zones

**Docs:** https://developer.ui.com/network/v10.1.84/getfirewallzones

```
GET /proxy/network/integration/v1/sites/{siteId}/firewall/zones
```

**List Firewall Zones**

Retrieve a list of all firewall zones on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
      "name": "Hotspot|My custom zone",
      "networkIds": [
        "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
      ],
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/zones" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/zones" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create Firewall Zone

**Docs:** https://developer.ui.com/network/v10.1.84/createfirewallzone

```
POST /proxy/network/integration/v1/sites/{siteId}/firewall/zones
```

**Create Custom Firewall Zone**

Create a new custom firewall zone on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ]
}
```

**Response:**
```json
{
  "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ],
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/zones" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ]
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/zones" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "name": "Hotspot|My custom zone",
  "networkIds": [
    "dfb21062-8ea0-4dca-b1d8-1eb3da00e58b"
  ]
}'
```

---

### List Firewall Policies

**Docs:** https://developer.ui.com/network/v10.1.84/getfirewallpolicies

```
GET /proxy/network/integration/v1/sites/{siteId}/firewall/policies
```

**List Firewall Policies**

Retrieve a list of all firewall policies on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "enabled": true,
      "name": "My firewall policy",
      "description": "A description for my firewall policy",
      "index": 0,
      "action": {
        "type": "string"
      },
      "source": {
        "zoneId": "00000000-0000-0000-0000-000000000000",
        "trafficFilter": {
          "type": "string"
        }
      },
      "destination": {
        "zoneId": "00000000-0000-0000-0000-000000000000",
        "trafficFilter": {
          "type": "string"
        }
      },
      "ipProtocolScope": {
        "ipVersion": "string"
      },
      "connectionStateFilter": [
        "NEW"
      ],
      "ipsecFilter": "MATCH_ENCRYPTED",
      "loggingEnabled": true,
      "schedule": {
        "mode": "string"
      },
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create Firewall Policy

**Docs:** https://developer.ui.com/network/v10.1.84/createfirewallpolicy

```
POST /proxy/network/integration/v1/sites/{siteId}/firewall/policies
```

**Create Firewall Policy**

Create a new firewall policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  }
}
```

**Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "index": 0,
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  },
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/firewall/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  }
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/firewall/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "enabled": true,
  "name": "My firewall policy",
  "description": "A description for my firewall policy",
  "action": {
    "type": "string"
  },
  "source": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "destination": {
    "zoneId": "00000000-0000-0000-0000-000000000000",
    "trafficFilter": {
      "type": "string"
    }
  },
  "ipProtocolScope": {
    "ipVersion": "string"
  },
  "connectionStateFilter": [
    "NEW"
  ],
  "ipsecFilter": "MATCH_ENCRYPTED",
  "loggingEnabled": true,
  "schedule": {
    "mode": "string"
  }
}'
```

---


## Access Control

### Get ACL Rule

**Docs:** https://developer.ui.com/network/v10.1.84/getaclrule

```
GET /proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}
```

**Get ACL Rule**

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `aclRuleId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0,
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update ACL Rule

**Docs:** https://developer.ui.com/network/v10.1.84/updateaclrule

```
PUT /proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}
```

**Update ACL Rule**

Update an existing user defined ACL rule on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `aclRuleId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0
}
```

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0,
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0
}'
```

---

### Delete ACL Rule

**Docs:** https://developer.ui.com/network/v10.1.84/deleteaclrule

```
DELETE /proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}
```

**Delete ACL Rule**

Delete an existing user defined ACL rule on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `aclRuleId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules/{aclRuleId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Get ACL Rule Ordering

**Docs:** https://developer.ui.com/network/v10.1.84/getaclruleordering

```
GET /proxy/network/integration/v1/sites/{siteId}/acl-rules/ordering
```

**Get User-Defined ACL Rule Ordering**

Retrieve user-defined ACL rule ordering on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "orderedAclRuleIds": [
    "00000000-0000-0000-0000-000000000000"
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Reorder ACL Rules

**Docs:** https://developer.ui.com/network/v10.1.84/updateaclruleordering

```
PUT /proxy/network/integration/v1/sites/{siteId}/acl-rules/ordering
```

**Reorder User-Defined ACL Rules**

Reorder user-defined ACL rules on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "orderedAclRuleIds": [
    "00000000-0000-0000-0000-000000000000"
  ]
}
```

**Response:**
```json
{
  "orderedAclRuleIds": [
    "00000000-0000-0000-0000-000000000000"
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "orderedAclRuleIds": [
    "00000000-0000-0000-0000-000000000000"
  ]
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules/ordering" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "orderedAclRuleIds": [
    "00000000-0000-0000-0000-000000000000"
  ]
}'
```

---

### List ACL Rules

**Docs:** https://developer.ui.com/network/v10.1.84/getaclrulepage

```
GET /proxy/network/integration/v1/sites/{siteId}/acl-rules
```

**List ACL Rules**

$1a

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "enabled": true,
      "name": "string",
      "description": "string",
      "action": "ALLOW|BLOCK",
      "enforcingDeviceFilter": {
        "type": "string"
      },
      "index": 0,
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create ACL Rule

**Docs:** https://developer.ui.com/network/v10.1.84/createaclrule

```
POST /proxy/network/integration/v1/sites/{siteId}/acl-rules
```

**Create ACL Rule**

Create a new user defined ACL rule on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0
}
```

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0,
  "metadata": {
    "origin": "string"
  }
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/acl-rules" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/acl-rules" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true,
  "name": "string",
  "description": "string",
  "action": "ALLOW|BLOCK",
  "enforcingDeviceFilter": {
    "type": "string"
  },
  "index": 0
}'
```

---


## DNS Policies

### Get DNS Policy

**Docs:** https://developer.ui.com/network/v10.1.84/getdnspolicy

```
GET /proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}
```

**Get DNS Policy**

Retrieve specific DNS policy.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `dnsPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "metadata": {
    "origin": "string"
  },
  "domain": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update DNS Policy

**Docs:** https://developer.ui.com/network/v10.1.84/updatednspolicy

```
PUT /proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}
```

**Update DNS Policy**

Update an existing DNS policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `dnsPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "enabled": true
}
```

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "metadata": {
    "origin": "string"
  },
  "domain": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true
}'
```

---

### Delete DNS Policy

**Docs:** https://developer.ui.com/network/v10.1.84/deletednspolicy

```
DELETE /proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}
```

**Delete DNS Policy**

Delete an existing DNS policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `dnsPolicyId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/dns/policies/{dnsPolicyId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List DNS Policies

**Docs:** https://developer.ui.com/network/v10.1.84/getdnspolicypage

```
GET /proxy/network/integration/v1/sites/{siteId}/dns/policies
```

**List DNS Policies**

$1a

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "enabled": true,
      "metadata": {
        "origin": "string"
      },
      "domain": "string"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/dns/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/dns/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create DNS Policy

**Docs:** https://developer.ui.com/network/v10.1.84/creatednspolicy

```
POST /proxy/network/integration/v1/sites/{siteId}/dns/policies
```

**Create DNS Policy**

Create a new DNS policy on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "enabled": true
}
```

**Response:**
```json
{
  "type": "string",
  "id": "00000000-0000-0000-0000-000000000000",
  "enabled": true,
  "metadata": {
    "origin": "string"
  },
  "domain": "string"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/dns/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/dns/policies" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "enabled": true
}'
```

---


## Traffic Matching Lists

### Get Traffic Matching List

**Docs:** https://developer.ui.com/network/v10.1.84/gettrafficmatchinglist

```
GET /proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}
```

**Get Traffic Matching List**

Get an exist traffic matching list on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `trafficMatchingListId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Response:**
```json
{
  "type": "string",
  "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
  "name": "Allowed port list|Protected IP list"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Update Traffic Matching List

**Docs:** https://developer.ui.com/network/v10.1.84/updatetrafficmatchinglist

```
PUT /proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}
```

**Update Traffic Matching List**

Update an exist traffic matching list on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `trafficMatchingListId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "name": "Allowed port list|Protected IP list"
}
```

**Response:**
```json
{
  "type": "string",
  "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
  "name": "Allowed port list|Protected IP list"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X PUT "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "Allowed port list|Protected IP list"
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X PUT "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "Allowed port list|Protected IP list"
}'
```

---

### Delete Traffic Matching List

**Docs:** https://developer.ui.com/network/v10.1.84/deletetrafficmatchinglist

```
DELETE /proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}
```

**Delete Traffic Matching List**

Delete an exist traffic matching list on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `trafficMatchingListId` | ✓ | `string` |  |
| `siteId` | ✓ | `string` |  |

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X DELETE "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X DELETE "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Traffic Matching Lists

**Docs:** https://developer.ui.com/network/v10.1.84/gettrafficmatchinglists

```
GET /proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists
```

**List Traffic Matching Lists**

Retrieve all traffic matching lists on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
      "name": "Allowed port list|Protected IP list"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### Create Traffic Matching List

**Docs:** https://developer.ui.com/network/v10.1.84/createtrafficmatchinglist

```
POST /proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists
```

**Create Traffic Matching List**

Create a new traffic matching list on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Request Body:**
```json
{
  "type": "string",
  "name": "Allowed port list|Protected IP list"
}
```

**Response:**
```json
{
  "type": "string",
  "id": "ffcdb32c-6278-4364-8947-df4f77118df8",
  "name": "Allowed port list|Protected IP list"
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X POST "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "Allowed port list|Protected IP list"
}'
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X POST "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/traffic-matching-lists" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
  "type": "string",
  "name": "Allowed port list|Protected IP list"
}'
```

---


## Supporting Resources

### List WAN Interfaces

**Docs:** https://developer.ui.com/network/v10.1.84/getwansoverviewpage

```
GET /proxy/network/integration/v1/sites/{siteId}/wans
```

**List WAN Interfaces**

Returns available WAN interface definitions for a given site,
including identifiers and names. Useful for network and NAT configuration.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "Internet 1"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/wans" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/wans" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Site-To-Site VPN

**Docs:** https://developer.ui.com/network/v10.1.84/getsitetositevpntunnelpage

```
GET /proxy/network/integration/v1/sites/{siteId}/vpn/site-to-site-tunnels
```

**List Site-To-Site VPN Tunnels**

Retrieve a paginated list of all site-to-site VPN tunnels on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "string",
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/vpn/site-to-site-tunnels" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/vpn/site-to-site-tunnels" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List VPN Servers

**Docs:** https://developer.ui.com/network/v10.1.84/getvpnserverpage

```
GET /proxy/network/integration/v1/sites/{siteId}/vpn/servers
```

**List VPN Servers**

Retrieve a paginated list of all VPN servers on a site.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "type": "string",
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "string",
      "enabled": true,
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/vpn/servers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/vpn/servers" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Radius Profiles

**Docs:** https://developer.ui.com/network/v10.1.84/getradiusprofileoverviewpage

```
GET /proxy/network/integration/v1/sites/{siteId}/radius/profiles
```

**List Radius Profiles**

Returns available RADIUS authentication profiles, including configuration origin metadata.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "string",
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/radius/profiles" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/radius/profiles" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Device Tags

**Docs:** https://developer.ui.com/network/v10.1.84/getdevicetagpage

```
GET /proxy/network/integration/v1/sites/{siteId}/device-tags
```

**List Device Tags**

Returns all device tags defined within a site, which can be used for WiFi Broadcast assignments.

**Path Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `siteId` | ✓ | `string` |  |

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "string",
      "deviceIds": [
        "00000000-0000-0000-0000-000000000000"
      ],
      "metadata": {
        "origin": "string"
      }
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/sites/{siteId}/device-tags" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/sites/{siteId}/device-tags" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List DPI App Categories

**Docs:** https://developer.ui.com/network/v10.1.84/getdpiapplicationcategories

```
GET /proxy/network/integration/v1/dpi/categories
```

**List DPI Application Categories**

Returns predefined Deep Packet Inspection (DPI) application categories used for traffic identification and filtering.

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "3|5",
      "name": "Network protocols|Business tools"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/dpi/categories" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/dpi/categories" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List DPI Applications

**Docs:** https://developer.ui.com/network/v10.1.84/getdpiapplications

```
GET /proxy/network/integration/v1/dpi/applications
```

**List DPI Applications**

Lists DPI-recognized applications grouped under categories. Useful for firewall or traffic analytics integration.

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "id": "786435|720973",
      "name": "Adobe Express|Zoom"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/dpi/applications" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/dpi/applications" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---

### List Countries

**Docs:** https://developer.ui.com/network/v10.1.84/getcountries

```
GET /proxy/network/integration/v1/countries
```

**List Countries**

Returns ISO-standard country codes and names,
used for region-based configuration or regulatory compliance.

**Query Parameters:**

| Name | Required | Type | Description |
|------|:--------:|------|-------------|
| `offset` |  | `integer` |  |
| `limit` |  | `integer` |  |
| `filter` |  | `string` |  |

**Response:**
```json
{
  "offset": 0,
  "limit": 25,
  "count": 10,
  "totalCount": 1000,
  "data": [
    {
      "code": "CK|FK|KY",
      "name": "Cook Islands|Falkland Islands, Malvinas|Cayman Islands"
    }
  ]
}
```

**curl (local — direct to controller):**
```bash
curl -sS -L \
  -X GET "https://192.168.1.1/proxy/network/integration/v1/countries" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

**curl (cloud — via api.ui.com):**
```bash
curl -sS -L \
  -X GET "https://api.ui.com/proxy/network/integration/v1/countries" \
  -H "Accept: application/json" \
  -H "X-API-Key: <your-api-key>"
```

---


## Ansible

### Ansible Quick Start

**Docs:** https://developer.ui.com/network/v10.1.84/quick_start.ansible

> ℹ️ No endpoint data found (may be a docs/info page)

---

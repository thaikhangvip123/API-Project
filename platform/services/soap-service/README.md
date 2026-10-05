# soap-service

Roadmap step: 8

API type: SOAP

Purpose: expose one number-to-English-words SOAP method and its WSDL.

Endpoints:

- `GET /health`
- `GET /soap?wsdl`
- `POST /soap`

The `NumberToWords` operation accepts integers from `-999999999` through
`999999999`. Values outside that range return a SOAP client fault.

## Run locally

Python `3.11.6` is the verified development runtime.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m unittest discover -s test -v
```

Gunicorn is Unix-only and runs inside the Linux container. On Windows, use the
test suite or run the service through Docker Compose.

## Example request

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="urn:internship:soap:number-words">
  <soapenv:Body>
    <tns:NumberToWords>
      <tns:number>12045</tns:number>
    </tns:NumberToWords>
  </soapenv:Body>
</soapenv:Envelope>
```

The response contains `twelve thousand forty-five`.

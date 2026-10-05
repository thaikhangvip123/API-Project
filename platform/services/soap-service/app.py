import json
import re

from spyne import Application, Integer64, ServiceBase, Unicode, rpc
from spyne.error import Fault
from spyne.protocol.soap import Soap11
from spyne.server.wsgi import WsgiApplication

from number_words import MAX_VALUE, MIN_VALUE, number_to_words


SOAP_NAMESPACE = "urn:internship:soap:number-words"


class NumberWordsService(ServiceBase):
    @rpc(Integer64, _returns=Unicode, _operation_name="NumberToWords")
    def number_to_words(_ctx, number):
        try:
            return number_to_words(number)
        except (TypeError, ValueError) as error:
            raise Fault(faultcode="Client.ValidationError", faultstring=str(error)) from error


soap_application = WsgiApplication(
    Application(
        [NumberWordsService],
        tns=SOAP_NAMESPACE,
        in_protocol=Soap11(validator="lxml"),
        out_protocol=Soap11(),
    )
)


def _response(start_response, status, body, content_type):
    encoded_body = body.encode("utf-8")
    start_response(
        status,
        [
            ("Content-Type", content_type),
            ("Content-Length", str(len(encoded_body))),
            ("Cache-Control", "no-store"),
        ],
    )
    return [encoded_body]


def _public_soap_url(environ):
    host = environ.get("HTTP_HOST") or environ.get("SERVER_NAME", "localhost")
    path = f"{environ.get('SCRIPT_NAME', '')}{environ.get('PATH_INFO', '')}"
    return f"{environ.get('wsgi.url_scheme', 'http')}://{host}{path}"


def _serve_wsdl(environ, start_response):
    captured = {}

    def capture_response(status, headers, exc_info=None):
        captured["status"] = status
        captured["headers"] = headers
        captured["exc_info"] = exc_info

    response = soap_application(
        environ,
        capture_response,
        wsgi_url=_public_soap_url(environ),
    )
    try:
        body = b"".join(response)
    finally:
        close = getattr(response, "close", None)
        if close is not None:
            close()

    public_url = _public_soap_url(environ).encode("utf-8")
    body = re.sub(
        rb'(<wsdlsoap11:address location=")[^"]*("/>)',
        rb"\g<1>" + public_url + rb"\g<2>",
        body,
    )
    headers = [
        (name, str(len(body)) if name.lower() == "content-length" else value)
        for name, value in captured["headers"]
    ]
    start_response(captured["status"], headers, captured.get("exc_info"))
    return [body]


def application(environ, start_response):
    path = environ.get("PATH_INFO", "")
    method = environ.get("REQUEST_METHOD", "GET").upper()

    if path == "/health":
        if method not in {"GET", "HEAD"}:
            return _response(start_response, "405 Method Not Allowed", "", "text/plain")
        body = json.dumps(
            {
                "status": "ok",
                "service": "soap-service",
                "python": "3.11",
                "range": {"min": MIN_VALUE, "max": MAX_VALUE},
            }
        )
        if method == "HEAD":
            body = ""
        return _response(start_response, "200 OK", body, "application/json; charset=utf-8")

    if path != "/soap":
        return _response(start_response, "404 Not Found", "not found\n", "text/plain; charset=utf-8")

    query = environ.get("QUERY_STRING", "").lower()
    if method == "GET" and query != "wsdl":
        return _response(start_response, "404 Not Found", "not found\n", "text/plain; charset=utf-8")
    if method not in {"GET", "POST"}:
        return _response(start_response, "405 Method Not Allowed", "", "text/plain")

    forwarded_proto = environ.get("HTTP_X_FORWARDED_PROTO", "").split(",", 1)[0].strip()
    if forwarded_proto in {"http", "https"}:
        environ["wsgi.url_scheme"] = forwarded_proto

    if method == "GET":
        return _serve_wsdl(environ, start_response)

    return soap_application(environ, start_response)

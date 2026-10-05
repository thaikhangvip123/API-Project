import io
import json
import logging
import os
import sys
import unittest
from wsgiref.util import setup_testing_defaults

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import application  # noqa: E402
from gunicorn_config import JsonFormatter  # noqa: E402
from number_words import number_to_words  # noqa: E402


SOAP_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:tns="urn:internship:soap:number-words">
  <soapenv:Body>
    <tns:NumberToWords>
      <tns:number>{number}</tns:number>
    </tns:NumberToWords>
  </soapenv:Body>
</soapenv:Envelope>
"""


def request(path, method="GET", body=b"", query="", headers=None):
    environ = {}
    setup_testing_defaults(environ)
    environ.update(
        {
            "PATH_INFO": path,
            "QUERY_STRING": query,
            "REQUEST_METHOD": method,
            "CONTENT_LENGTH": str(len(body)),
            "wsgi.input": io.BytesIO(body),
            "HTTP_HOST": "example.test",
        }
    )
    if body:
        environ["CONTENT_TYPE"] = "text/xml; charset=utf-8"
    for name, value in (headers or {}).items():
        environ[f"HTTP_{name.upper().replace('-', '_')}"] = value

    response = {}

    def start_response(status, response_headers, _exc_info=None):
        response["status"] = status
        response["headers"] = dict(response_headers)

    response["body"] = b"".join(application(environ, start_response))
    return response


class NumberWordsTests(unittest.TestCase):
    def test_number_conversion_boundaries_and_chunks(self):
        self.assertEqual(number_to_words(0), "zero")
        self.assertEqual(number_to_words(-42), "minus forty-two")
        self.assertEqual(
            number_to_words(999_999_999),
            "nine hundred ninety-nine million nine hundred ninety-nine thousand "
            "nine hundred ninety-nine",
        )

    def test_number_conversion_rejects_invalid_values(self):
        with self.assertRaises(TypeError):
            number_to_words(True)
        with self.assertRaises(ValueError):
            number_to_words(1_000_000_000)

    def test_gunicorn_formatter_emits_valid_json(self):
        record = logging.LogRecord(
            "gunicorn.access",
            logging.INFO,
            __file__,
            1,
            'request with "quotes"',
            (),
            None,
        )
        payload = json.loads(JsonFormatter().format(record))
        self.assertEqual(payload["level"], "info")
        self.assertEqual(payload["message"], 'request with "quotes"')


class WsgiTests(unittest.TestCase):
    def test_health(self):
        response = request("/health")
        self.assertEqual(response["status"], "200 OK")
        payload = json.loads(response["body"])
        self.assertEqual(payload["service"], "soap-service")
        self.assertEqual(payload["status"], "ok")

    def test_wsdl_is_available_at_exact_endpoint(self):
        response = request("/soap", query="wsdl")
        self.assertEqual(response["status"], "200 OK")
        self.assertIn(b"NumberToWords", response["body"])
        self.assertIn(b"http://example.test/soap", response["body"])

    def test_wsdl_uses_forwarded_https_scheme(self):
        response = request("/soap", query="wsdl", headers={"X-Forwarded-Proto": "https"})
        self.assertIn(b"https://example.test/soap", response["body"])

    def test_soap_number_to_words(self):
        body = SOAP_TEMPLATE.format(number=12045).encode()
        response = request("/soap", method="POST", body=body)
        self.assertEqual(response["status"], "200 OK")
        self.assertIn(b"twelve thousand forty-five", response["body"])

    def test_out_of_range_number_returns_soap_fault(self):
        body = SOAP_TEMPLATE.format(number=1_000_000_000).encode()
        response = request("/soap", method="POST", body=body)
        self.assertEqual(response["status"], "500 Internal Server Error")
        self.assertIn(b"Client.ValidationError", response["body"])

    def test_unknown_route_is_not_exposed(self):
        response = request("/unknown")
        self.assertEqual(response["status"], "404 Not Found")


if __name__ == "__main__":
    unittest.main()

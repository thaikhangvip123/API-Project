import { apiRequest } from './api-client.js';

const MIN_NUMBER = -999999999;
const MAX_NUMBER = 999999999;

export function initializeSoap() {
  document.querySelector('#soap-form').addEventListener('submit', executeSoap);
  document.querySelector('#soap-number').addEventListener('input', previewEnvelope);
  previewEnvelope();
}

async function executeSoap(event) {
  event.preventDefault();
  const input = document.querySelector('#soap-number');
  const number = Number(input.value);
  if (!Number.isSafeInteger(number) || number < MIN_NUMBER || number > MAX_NUMBER) {
    showSoapResponse('VALIDATION', 'Nhập số nguyên trong khoảng -999999999 đến 999999999.', true);
    return;
  }

  const envelope = createEnvelope(number);
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await apiRequest('/soap', {
      method: 'POST',
      rawBody: envelope,
      headers: {
        Accept: 'text/xml, application/soap+xml',
        'Content-Type': 'text/xml; charset=utf-8'
      }
    });
    showSoapResponse(`HTTP ${response.status} · ${response.durationMs} ms`, response.body, false);
  } catch (error) {
    showSoapResponse(error.status ? `HTTP ${error.status}` : 'REQUEST ERROR', typeof error.body === 'string' ? error.body : error.message, true);
  } finally {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
  }
}

function previewEnvelope() {
  const value = Number(document.querySelector('#soap-number').value || 0);
  document.querySelector('#soap-request').textContent = createEnvelope(Number.isSafeInteger(value) ? value : 0);
}

function createEnvelope(number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:tns="urn:internship:soap:number-words">
  <soapenv:Body>
    <tns:NumberToWords>
      <tns:number>${number}</tns:number>
    </tns:NumberToWords>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function showSoapResponse(meta, body, isError) {
  const response = document.querySelector('#soap-response');
  response.hidden = false;
  response.classList.toggle('has-errors', isError);
  document.querySelector('#soap-meta').textContent = meta;
  document.querySelector('#soap-body').textContent = body;
}

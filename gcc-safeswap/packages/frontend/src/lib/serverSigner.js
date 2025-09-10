import { API_BASE } from './apiBase.js';

export class ServerSigner {
  constructor(sessionId, address) {
    this.sessionId = sessionId;
    this._address = address;
  }

  async getAddress() {
    return this._address;
  }

  async signTransaction(tx) {
    const resp = await fetch(`${API_BASE}/api/wallet/signTransaction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, tx })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || 'sign failed');
    return data.rawTx;
  }

  async signTypedData(domain, types, message) {
    const resp = await fetch(`${API_BASE}/api/wallet/signTypedData`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, domain, types, message })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || 'sign failed');
    return data.signature;
  }
}

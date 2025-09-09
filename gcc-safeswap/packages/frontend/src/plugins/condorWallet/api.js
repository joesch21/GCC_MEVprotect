export async function uploadImage(file) {
  const form = new FormData();
  form.append('image', file);
  const resp = await fetch('/api/plugins/condor-wallet/upload', { method: 'POST', body: form });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error || 'upload failed');
  return data;
}

export class CondorServerSigner {
  constructor(sessionId, address) {
    this.sessionId = sessionId;
    this._address = address;
  }
  async getAddress() {
    return this._address;
  }
  async signTransaction(tx) {
    const resp = await fetch('/api/plugins/condor-wallet/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, payload: { type: 'tx', data: tx } })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || 'sign failed');
    return data.signature;
  }
  async signTypedData(domain, types, message) {
    const resp = await fetch('/api/plugins/condor-wallet/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, payload: { type: 'eip712', data: { domain, types, message } } })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || 'sign failed');
    return data.signature;
  }
}

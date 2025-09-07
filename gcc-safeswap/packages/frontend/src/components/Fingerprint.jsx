import React from 'react';

export default function Fingerprint({ value }) {
  if (!value) return null;
  return <span className="fingerprint">{value}</span>;
}

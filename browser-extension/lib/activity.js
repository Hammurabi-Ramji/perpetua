// Hostname matching for opt-in keep-alive resets. Runs in the extension.
// A visit is reported only as a hostname — never a path, title, or inbox.

function normalizeActivityHost(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return null;
  }
  let host = url.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  return host || null;
}

function hostsMatch(visitHost, licenseHost) {
  return visitHost === licenseHost || visitHost.endsWith(`.${licenseHost}`);
}

// Returns the hostname to send, or null when nothing should be sent.
function visitShouldReset(enabled, visitUrl, licenseHosts) {
  if (enabled !== true) return null;
  const visit = normalizeActivityHost(visitUrl);
  if (!visit) return null;
  const matched = (licenseHosts || []).some((candidate) => {
    const host = normalizeActivityHost(candidate);
    return Boolean(host) && hostsMatch(visit, host);
  });
  return matched ? visit : null;
}

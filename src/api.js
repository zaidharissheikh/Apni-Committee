export async function api(path, body, method) {
  const response = await fetch('/api/' + path, {
    credentials: 'same-origin',
    ...(body !== undefined ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('auth/')) window.dispatchEvent(new Event('session-expired'));
    throw Error(data.error || 'Request failed. Please try again.');
  }
  return data;
}

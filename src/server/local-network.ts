/** Returns true only for loopback client addresses, including IPv4-mapped IPv6. */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const value = address.toLowerCase().trim();
  if (value === '::1' || value === '127.0.0.1') return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return mapped === '127.0.0.1';
  }
  return false;
}

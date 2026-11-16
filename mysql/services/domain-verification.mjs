import { resolve4, resolve6, resolveTxt } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const ipv4PrivateRanges = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4Number(address) {
  return address.split(".").reduce((value, octet) => (value * 256) + Number(octet), 0);
}

function inIpv4Range(address, network, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
}

function ipv6Number(address) {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;
    const number = ipv4Number(ipv4);
    value = `${value.slice(0, lastColon)}:${(number >>> 16).toString(16)}:${(number & 0xffff).toString(16)}`;
  }
  if ((value.match(/::/g) ?? []).length > 1) return null;
  const [left, right = ""] = value.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const missing = 8 - leftGroups.length - rightGroups.length;
  if ((value.includes("::") && missing < 1) || (!value.includes("::") && missing !== 0)) return null;
  const groups = [...leftGroups, ...Array(Math.max(0, missing)).fill("0"), ...rightGroups];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function inIpv6Range(address, network, prefix) {
  const addressValue = ipv6Number(address);
  const networkValue = ipv6Number(network);
  if (addressValue === null || networkValue === null) return true;
  const shift = BigInt(128 - prefix);
  return (addressValue >> shift) === (networkValue >> shift);
}

export function isPublicIp(address) {
  const family = isIP(address);
  if (family === 4) return !ipv4PrivateRanges.some(([network, prefix]) => inIpv4Range(address, network, prefix));
  if (family !== 6) return false;
  const value = ipv6Number(address);
  if (value === null || value < (0x20000000000000000000000000000000n) || value >= (0x40000000000000000000000000000000n)) return false;
  return ![
    ["2001::", 23], ["2001:10::", 28], ["2001:db8::", 32],
    ["2002::", 16], ["3fff::", 20],
  ].some(([network, prefix]) => inIpv6Range(address, network, prefix));
}

export function normalizeHostname(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 253 || /[/?#@:\\\s]/.test(input)) {
    throw new Error("invalid_hostname");
  }
  let hostname;
  try { hostname = new URL(`https://${input.trim()}`).hostname.toLowerCase().replace(/\.$/, ""); }
  catch { throw new Error("invalid_hostname"); }
  if (!hostname || hostname.length > 253 || isIP(hostname) || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("invalid_hostname");
  }
  const labels = hostname.split(".");
  if (labels.length < 2 || labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error("invalid_hostname");
  }
  return hostname;
}

function httpsHead(hostname, address) {
  return new Promise((resolve) => {
    const family = isIP(address);
    const request = httpsRequest({
      hostname,
      port: 443,
      method: "HEAD",
      path: "/",
      servername: hostname,
      rejectUnauthorized: true,
      lookup: (_name, _options, callback) => callback(null, address, family),
    }, (response) => {
      const statusCode = response.statusCode ?? null;
      response.resume();
      resolve({ verified: true, statusCode, errorCode: null });
    });
    request.setTimeout(8000, () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    request.once("error", (error) => resolve({
      verified: false,
      statusCode: null,
      errorCode: String(error.code ?? "https_unavailable").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 96),
    }));
    request.end();
  });
}

export async function verifyDomainRecords(hostname, challenge) {
  const [ipv4, ipv6, txt] = await Promise.allSettled([
    resolve4(hostname),
    resolve6(hostname),
    resolveTxt(`_adometa-verification.${hostname}`),
  ]);
  const addresses = [
    ...(ipv4.status === "fulfilled" ? ipv4.value : []),
    ...(ipv6.status === "fulfilled" ? ipv6.value : []),
  ];
  if (!addresses.length) {
    return { dnsVerified: false, httpsVerified: false, verificationFailed: false, errorCode: "dns_records_not_found", responseStatus: null };
  }
  if (addresses.some((address) => !isPublicIp(address))) {
    return { dnsVerified: false, httpsVerified: false, verificationFailed: true, errorCode: "dns_target_not_public", responseStatus: null };
  }
  const txtValues = txt.status === "fulfilled" ? txt.value.map((parts) => parts.join("")) : [];
  if (!txtValues.includes(challenge)) {
    return { dnsVerified: false, httpsVerified: false, verificationFailed: false, errorCode: "dns_challenge_not_found", responseStatus: null };
  }

  const checks = [];
  for (const address of addresses) {
    const check = await httpsHead(hostname, address);
    checks.push(check);
    if (check.verified) return { dnsVerified: true, httpsVerified: true, verificationFailed: false, errorCode: null, responseStatus: check.statusCode };
  }
  const certificateFailure = checks.some(({ errorCode }) => /CERT|TLS|ALTNAME/i.test(errorCode ?? ""));
  return {
    dnsVerified: true,
    httpsVerified: false,
    verificationFailed: certificateFailure,
    errorCode: checks[0]?.errorCode ?? "https_unavailable",
    responseStatus: null,
  };
}

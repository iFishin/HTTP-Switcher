'use strict';

const net = require('net');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * API Key 认证中间件。
 * 检查请求头 X-API-Key 或 Authorization: Bearer <key> 是否与配置匹配。
 * 若 config.security.apiKey 为空字符串，则不启用认证。
 */
function apiKeyAuth(req, res, next) {
  const expected = config.security.apiKey;
  if (!expected) {
    return next();
  }

  // 支持 X-API-Key 和 Authorization: Bearer <key> 两种传法
  let provided = req.headers['x-api-key'];
  if (!provided) {
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      provided = auth.slice(7);
    }
  }

  if (!provided || provided !== expected) {
    logger.warn({ ip: req.ip }, 'API Key authentication failed');
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API Key' });
  }

  next();
}

/**
 * IP 白名单中间件。
 * 仅当 config.security.enableIpWhitelist 开启时生效。
 */
function ipWhitelist(req, res, next) {
  if (!config.security.enableIpWhitelist) {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;
  const allowed = config.security.allowedIps;

  if (allowed.length > 0 && !allowed.includes(clientIp)) {
    return res.status(403).json({ error: 'Forbidden: IP not allowed' });
  }

  next();
}

/**
 * 验证目标 URL 是否在白名单网段内。
 */
function isUrlAllowed(targetUrl) {
  if (!config.security.enableUrlWhitelist) {
    return true;
  }

  const blocks = config.security.allowedCidrBlocks;
  if (blocks.length === 0) return true;

  try {
    const url = new URL(targetUrl);
    const hostname = url.hostname;

    if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
      return blocks.some(block => ipInCidr(hostname, block));
    }
    return true;
  } catch {
    return false;
  }
}

function ipInCidr(ip, cidr) {
  const [range, bits = 32] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  return (ipInt & mask) === (rangeInt & mask);
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

module.exports = { apiKeyAuth, ipWhitelist, isUrlAllowed };

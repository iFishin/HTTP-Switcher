'use strict';

require('dotenv').config();

const config = {
  // 服务端口
  port: parseInt(process.env.PORT, 10) || 8080,

  // 允许的入站 HTTP 方法（逗号分隔），默认仅 POST
  allowedMethods: (process.env.ALLOWED_METHODS || 'POST')
    .split(',')
    .map(s => s.trim().toUpperCase()),

  // 响应模式: passthrough | base64
  // passthrough - 透传宿主机原始响应（默认，适用于普通 HTTP 调用）
  // base64      - 二进制文件（图片、Office 等）返回 base64 + 原始类型信息
  responseMode: process.env.RESPONSE_MODE || 'passthrough',
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,

  // Body 大小限制
  bodySizeLimit: process.env.BODY_SIZE_LIMIT || '10mb',

  // ----- 目标 URL 解析规则 -----
  parsing: {
    // Header 字段名
    headerTargetUrl: process.env.TARGET_URL_HEADER || 'X-Target-URL',
    headerTargetMethod: process.env.TARGET_METHOD_HEADER || 'X-Target-Method',
    headerTargetHeaders: process.env.TARGET_HEADERS_HEADER || 'X-Target-Headers',

    // Body JSON 路径链（逗号分隔，按顺序依次尝试）
    bodyTargetUrlPaths: (process.env.BODY_TARGET_URL_PATHS || 'target_url')
      .split(',').map(s => s.trim()).filter(Boolean),
    bodyTargetMethodPaths: (process.env.BODY_TARGET_METHOD_PATHS || 'target_method')
      .split(',').map(s => s.trim()).filter(Boolean),
    bodyTargetHeadersPaths: (process.env.BODY_TARGET_HEADERS_PATHS || 'target_headers')
      .split(',').map(s => s.trim()).filter(Boolean),
    bodyTargetBodyPaths: (process.env.BODY_TARGET_BODY_PATHS || 'target_body')
      .split(',').map(s => s.trim()).filter(Boolean),
  },

  // ----- 安全配置 -----
  security: {
    // API Key 认证：若为空则不启用
    apiKey: process.env.API_KEY || '',

    enableUrlWhitelist: process.env.ENABLE_URL_WHITELIST === 'true',
    allowedCidrBlocks: (process.env.ALLOWED_CIDR_BLOCKS || '192.168.0.0/16,10.0.0.0/8')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),

    enableIpWhitelist: process.env.ENABLE_IP_WHITELIST === 'true',
    allowedIps: (process.env.ALLOWED_IPS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },

  // ----- 过滤的内部请求头 -----
  filteredRequestHeaders: [
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'keep-alive',
    'upgrade',
  ].map(s => s.toLowerCase()),
};

module.exports = config;

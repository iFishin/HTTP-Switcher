'use strict';

require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./utils/logger');
const { parseTargetInfo } = require('./middleware/parser');
const { apiKeyAuth, ipWhitelist, isUrlAllowed } = require('./middleware/security');
const { forwardRequest, pipeUpstreamResponse, handleBinaryResponse, isBinaryContentType } = require('./services/proxy');

const app = express();

// ---- 全局中间件 ----
app.use(ipWhitelist);
app.use(apiKeyAuth);
app.use(express.json({ limit: config.bodySizeLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodySizeLimit }));

// ---- 请求 ID 生成 ----
function generateRequestId(req) {
  return req.headers['x-request-id']
    || req.headers['x-lark-request-id']
    || crypto.randomUUID();
}

// ---- 方法限制中间件 ----
function methodRestrictor(req, res, next) {
  if (!config.allowedMethods.includes(req.method)) {
    logger.warn({ method: req.method, ip: req.ip }, 'Method not allowed');
    return res.status(405)
      .set('Allow', config.allowedMethods.join(', '))
      .json({ error: `Method ${req.method} not allowed. Allowed: ${config.allowedMethods.join(', ')}` });
  }
  next();
}

// ---- 主处理器：仅接收配置允许的 HTTP 方法 ----
app.all('*', methodRestrictor, async (req, res) => {
  const requestId = generateRequestId(req);
  const startTime = Date.now();

  logger.info({
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  }, 'Incoming request');

  try {
    // 1. 解析目标信息
    const targetInfo = parseTargetInfo(req, config);

    if (targetInfo.error) {
      logger.warn({ requestId, error: targetInfo.error }, 'Failed to parse target info');
      return res.status(400).json({ error: targetInfo.error });
    }

    // 2. 安全校验：目标 URL 网段白名单
    if (!isUrlAllowed(targetInfo.targetUrl)) {
      logger.warn({ requestId, targetUrl: targetInfo.targetUrl }, 'Target URL not allowed by CIDR whitelist');
      return res.status(403).json({ error: 'Target URL not allowed' });
    }

    logger.info({
      requestId,
      targetUrl: targetInfo.targetUrl,
      targetMethod: targetInfo.targetMethod,
      source: targetInfo.source,
    }, 'Parsed target info');

    // 3. 发起真实请求
    const upstreamResponse = await forwardRequest(targetInfo, req);

    // 4. 根据响应模式处理结果
    const upstreamContentType = upstreamResponse.headers['content-type'] || '';

    if (config.responseMode === 'base64' && isBinaryContentType(upstreamContentType)) {
      handleBinaryResponse(upstreamResponse, res, requestId, startTime);
    } else {
      pipeUpstreamResponse(upstreamResponse, res, requestId, startTime);
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error.response) {
      logger.warn({ requestId, status: error.response.status, duration }, 'Upstream returned error status');
      if (!res.headersSent) {
        res.status(error.response.status || 502);
        if (error.response.data) {
          error.response.data.resume?.();
          res.json({ error: 'Upstream error', upstreamStatus: error.response.status });
        } else {
          res.end();
        }
      }
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      logger.error({ requestId, duration }, 'Request timeout');
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway Timeout' });
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
      logger.error({ requestId, err: error.message, duration }, 'Upstream unreachable');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Bad Gateway', message: 'Upstream unreachable' });
      }
    } else {
      logger.error({ requestId, err: error.message, duration }, 'Unexpected error');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Bad Gateway', message: error.message });
      }
    }
  }
});

// ---- 404 兜底 ----
app.use((req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not Found' });
  }
});

// ---- 全局错误捕获 ----
app.use((err, req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---- 启动 ----
app.listen(config.port, '0.0.0.0', () => {
  logger.info({ port: config.port, allowedMethods: config.allowedMethods }, 'HTTP Switcher service started');
  logger.info({
    security: {
      apiKey: config.security.apiKey ? 'enabled' : 'disabled',
      ipWhitelist: config.security.enableIpWhitelist,
      urlWhitelist: config.security.enableUrlWhitelist,
    },
  }, 'Security settings');
});

module.exports = app;

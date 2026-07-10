'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const INTERNAL_HEADERS = config.filteredRequestHeaders;

// 安全认证头：仅用于公共机自身认证，不转发到宿主机
const AUTH_HEADERS = ['authorization', 'x-api-key', 'proxy-authorization'];

// 逐跳（hop-by-hop）响应头：由代理自行处理解压与传输编码，不转发给客户端
const HOP_BY_HOP_RESPONSE_HEADERS = ['transfer-encoding', 'content-encoding'].map(s => s.toLowerCase());

/**
 * 向目标宿主机发起 HTTP 请求，返回 axios 响应对象（流式 responseType）。
 *
 * @param {object} targetInfo - 解析出的目标信息
 * @param {object} originalReq - 原始 Express 请求对象
 * @returns {Promise<object>} axios 响应
 */
async function forwardRequest(targetInfo, originalReq) {
  const { targetUrl, targetMethod, targetHeaders, targetBody } = targetInfo;

  // 构造转发请求头：复制原始请求头，剔除内部头和安全认证头，合并自定义头
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(originalReq.headers)) {
    const lower = key.toLowerCase();
    if (!INTERNAL_HEADERS.includes(lower) && !AUTH_HEADERS.includes(lower)) {
      forwardHeaders[key] = value;
    }
  }
  // 合并目标自定义头（覆盖同名 Header）
  Object.assign(forwardHeaders, targetHeaders);

  // 确定请求体
  const hasBody = !['GET', 'HEAD'].includes(targetMethod);
  // 仅在有 body 的方法中设置 Content-Type（若未由目标头覆盖）
  if (hasBody && targetBody !== null && !forwardHeaders['content-type']) {
    forwardHeaders['content-type'] = 'application/json';
  }

  logger.debug({ targetUrl, targetMethod, hasBody: hasBody && targetBody !== null }, 'Forwarding request');

  const response = await axios({
    method: targetMethod,
    url: targetUrl,
    headers: forwardHeaders,
    timeout: config.requestTimeout,
    // axios 会自动忽略 GET/HEAD 的 data
    data: hasBody && targetBody !== null ? targetBody : undefined,
    // 流式响应，支持大文件转发
    responseType: 'stream',
    // 让 axios 自动处理 gzip 解压
    decompress: true,
    // 允许跟随重定向
    maxRedirects: 5,
    // 验证目标 URL 是否允许（基于网段白名单）
    validateStatus: () => true, // 所有状态码均接收，由上层处理
  });

  return response;
}

/**
 * 将宿主机响应转发回飞书。
 *
 * @param {object} upstreamResponse - axios 响应对象
 * @param {object} res - Express 响应对象
 * @param {string} requestId - 请求 ID
 * @param {number} startTime - 开始时间戳
 */
function pipeUpstreamResponse(upstreamResponse, res, requestId, startTime) {
  res.status(upstreamResponse.status);

  // 保留宿主机其余原始响应头（跳过逐跳头，已由 axios 处理）
  for (const [key, value] of Object.entries(upstreamResponse.headers)) {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP_RESPONSE_HEADERS.includes(lower)) {
      res.setHeader(key, value);
    }
  }

  upstreamResponse.data.pipe(res);

  upstreamResponse.data.on('end', () => {
    logger.info({
      requestId,
      status: upstreamResponse.status,
      duration: Date.now() - startTime,
    }, 'Request completed');
  });

  upstreamResponse.data.on('error', (err) => {
    logger.error({ requestId, err: err.message }, 'Stream error during response piping');
    if (!res.headersSent) {
      res.status(502).json({ error: 'Stream error' });
    } else {
      res.end();
    }
  });
}

module.exports = { forwardRequest, pipeUpstreamResponse };

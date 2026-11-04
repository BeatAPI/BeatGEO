const messages = {
  400: ['The query parameters were rejected. Review the domain, market and keywords before trying again.', '查询参数未被接受。请检查域名、目标市场和关键词后重新预览。'],
  401: ['The API key was not accepted. Save a valid BeatAPI key in Connection settings, then preview the query again.', 'API Key 未通过验证。请在连接设置中保存有效的 BeatAPI Key，再重新预览查询。'],
  402: ['The account could not pay for this query. Check the BeatAPI balance and billing status before trying again.', '账户无法支付本次查询。请检查 BeatAPI 余额和计费状态后再试。'],
  403: ['This key does not have permission for the query. Check its SEO access in BeatAPI or use an authorized key.', '当前 Key 没有本次查询的访问权限。请检查 BeatAPI 的 SEO 权限，或更换有权限的 Key。'],
  429: ['The request limit was reached. Wait before trying again, and reduce the number of queries.', '请求过于频繁。请稍后重试，并减少一次执行的查询数量。'],
  500: ['The service could not complete the query. Try again later; if it continues, contact BeatAPI support.', '服务暂时无法完成查询。请稍后重试；若持续失败，请联系 BeatAPI 支持。'],
  503: ['The service is temporarily unavailable. Try again later; if it continues, contact BeatAPI support.', '服务暂时不可用。请稍后重试；若持续失败，请联系 BeatAPI 支持。'],
};
const codeStatus = {invalid_api_key:401,unauthorized:401,insufficient_balance:402,insufficient_quota:402,forbidden:403,rate_limit_exceeded:429,rate_limited:429,processing_unavailable:503};

export function seoFailureMessage(record, lang='en') {
  const zh=lang==='zh',status=Number.isInteger(record.httpStatus)&&record.httpStatus>=400&&record.httpStatus<=599?record.httpStatus:null;
  const prefix=status?`HTTP ${status} · `:'';
  if(record.error==='transport_or_invalid_response')return prefix+(zh
    ?'未能确认本次请求的结果（网络中断、超时或响应无效）。请先检查网络并核对 BeatAPI 用量；请求可能已扣费，重新分析会发起新的请求。'
    :'The result could not be confirmed (network interruption, timeout or invalid response). Check the connection and BeatAPI usage first; the request may have been charged, and a new analysis sends a new request.');
  const message=messages[status??codeStatus[record.error]];
  return prefix+(message?message[zh?1:0]:zh
    ?'查询未完成。请检查查询范围、连接设置及 BeatAPI 服务状态；重新分析前先核对账户用量。'
    :'The query did not complete. Check the query scope, connection settings and BeatAPI service status; review account usage before running a new analysis.');
}

const stopMessages = {
  cancelled:['Analysis stopped at your request; completed results are saved. Review them before starting a new analysis.', '已按你的操作停止后续查询，已收到的结果已保存。请先查看结果，再决定是否重新分析。'],
  budget_or_request_cap:['The budget or request limit was reached. Review saved results and the remaining scope before adjusting the limit.', '已达到预算或请求次数上限。请先查看已保存结果及剩余范围，再调整上限。'],
  price_exceeded_estimate:['A recorded charge exceeded the estimate, so later queries were stopped. Check BeatAPI usage and current prices before continuing.', '已记录费用超过预估，后续查询已停止。请核对 BeatAPI 用量与当前价格后再继续。'],
  authorization_or_balance:['Later queries were stopped because access or billing was rejected. Follow the failed-query instructions below before trying again.', '访问权限或计费校验未通过，后续查询已停止。请按下方失败查询的提示处理后再试。'],
};

export function seoStopMessage(stopped, lang='en') {
  if(!stopped)return '';
  const zh=lang==='zh',message=Object.hasOwn(stopMessages,stopped)?stopMessages[stopped]:null;
  return message?message[zh?1:0]:zh
    ?'采集已停止，当前报告保留已收到的结果。请检查失败查询和账户用量后再决定是否重新分析。'
    :'Collection stopped; received results are retained in this report. Review failed queries and account usage before starting another analysis.';
}

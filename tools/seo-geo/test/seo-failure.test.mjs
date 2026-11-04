import test from 'node:test';
import assert from 'node:assert/strict';
import {seoFailureMessage,seoStopMessage} from '../src/seo-failure.mjs';
import {normalizeSeoSnapshot,seoSummary} from '../src/seo.mjs';
import {renderHtml,renderMarkdown} from '../src/report.mjs';

const snapshot=httpStatus=>({schema:'beat-geo/seo-snapshot@1',site:'acme.example',createdAt:'2026-10-31T00:00:00Z',stopped:'authorization_or_balance',records:[{
  tool:'domain-rating',input:{domain:'acme.example'},fetchedAt:'2026-10-31T00:00:00Z',status:'error',httpStatus,error:'request_failed',
}]});

test('HTTP failures provide localized recovery instructions without exposing provider messages',()=>{
  for(const [status,en,zh] of [[401,/valid BeatAPI key/,/有效的 BeatAPI Key/],[402,/balance/,/余额/],[403,/permission/,/权限/],[429,/Wait before trying again/,/稍后重试/],[503,/temporarily unavailable/,/暂时不可用/]]){
    const record={httpStatus:status,error:'secret-account-response'};
    for(const [lang,expected] of [['en',en],['zh',zh]]){
      const text=seoFailureMessage(record,lang);assert.match(text,new RegExp(`HTTP ${status}`));assert.match(text,expected);assert.ok(!text.includes(record.error));
    }
  }
  assert.match(seoFailureMessage({error:'transport_or_invalid_response'},'zh'),/可能已扣费/);
  assert.match(seoFailureMessage({error:'transport_or_invalid_response'}),/may have been charged/);
  assert.match(seoFailureMessage({error:'invalid_api_key'},'zh'),/API Key 未通过验证/);
  assert.ok(!seoFailureMessage({error:'sk-private-value'}).includes('sk-private-value'));
});

test('safe HTTP status survives snapshot import and summary generation; invalid or success statuses do not',()=>{
  for(const status of [400,401,402,403,429,500,503,599])assert.equal(seoSummary(snapshot(status)).records[0].httpStatus,status);
  for(const status of ['401',200,600,401.5,null])assert.equal(normalizeSeoSnapshot(snapshot(status)).records[0].httpStatus,undefined);
});

test('HTML and Markdown reports show actionable failures before collapsed evidence',()=>{
  const summary=seoSummary(snapshot(401));
  const html=renderHtml(summary,[],{lang:'zh'}),md=renderMarkdown(summary,[],{lang:'zh'});
  const initial=html.slice(html.indexOf('<main>'),html.indexOf('<details'));
  assert.match(initial,/需要处理的查询/);assert.match(initial,/HTTP 401/);assert.match(initial,/连接设置/);
  assert.match(md,/HTTP 401/);assert.match(md,/API Key 未通过验证/);
  assert.ok(!html.includes('authorization_or_balance'));assert.ok(!html.includes('request_failed'));
  const english=renderHtml(summary,[]);assert.match(english,/Queries needing attention/);assert.match(english,/valid BeatAPI key/);
});

test('stopped collection explains the next action without leaking unrecognized reason strings',()=>{
  assert.equal(seoStopMessage(null,'zh'),'');
  assert.match(seoStopMessage('authorization_or_balance','zh'),/失败查询/);
  assert.match(seoStopMessage('cancelled','zh'),/已保存/);
  assert.match(seoStopMessage('budget_or_request_cap'),/budget or request limit/);
  assert.match(seoStopMessage('price_exceeded_estimate','zh'),/核对/);
  for(const value of ['private-secret','constructor','__proto__']){const message=seoStopMessage(value);assert.equal(typeof message,'string');assert.ok(!message.includes(value));}
});

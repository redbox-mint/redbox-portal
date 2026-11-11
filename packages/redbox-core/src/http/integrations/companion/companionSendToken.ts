import { escapeHtmlText } from '@researchdatabox/sails-ng-common';

interface CompanionSendTokenConfig {
  targetOrigin: string;
  provider: string;
  secureCookie: boolean;
}

function normalizeCompanionTargetOrigin(appUrl: string): string {
  const trimmedAppUrl = String(appUrl ?? '').trim();
  if (!trimmedAppUrl) {
    return '';
  }
  try {
    return new URL(trimmedAppUrl).origin;
  } catch (_err) {
    return trimmedAppUrl;
  }
}

function sanitizeCompanionProvider(provider: string): string {
  const trimmedProvider = String(provider ?? '')
    .trim()
    .toLowerCase();
  if (trimmedProvider === 'drive' || trimmedProvider === 'googledrive' || trimmedProvider === 'onedrive') {
    return trimmedProvider;
  }
  return '';
}

export function buildCompanionSendTokenConfig(appUrl: string, provider: string): CompanionSendTokenConfig {
  const targetOrigin = normalizeCompanionTargetOrigin(appUrl);
  return {
    targetOrigin,
    provider: sanitizeCompanionProvider(provider),
    secureCookie: targetOrigin.startsWith('https://'),
  };
}

export function buildCompanionSendTokenHtml(appUrl: string, provider: string): string {
  const configJson = escapeHtmlText(JSON.stringify(buildCompanionSendTokenConfig(appUrl, provider)));
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><div hidden id="companion-send-token-config">${configJson}</div><script>(function(){'use strict';var configElement=document.getElementById('companion-send-token-config');var config={targetOrigin:'',provider:'',secureCookie:false};try{config=JSON.parse(configElement&&configElement.textContent?configElement.textContent:'{}');}catch(_e){}var origin=typeof config.targetOrigin==='string'?config.targetOrigin:'';var provider=typeof config.provider==='string'?config.provider:'';var query=new URLSearchParams(window.location.search);var hashRaw=window.location.hash&&window.location.hash.charAt(0)==='#'?window.location.hash.slice(1):'';var hash=new URLSearchParams(hashRaw);var token=(query.get('uppyAuthToken')||hash.get('uppyAuthToken')||'').trim();if(!origin||!token){if(origin){window.location.replace(origin);}return;}if(provider){var storageKey='companion-'+provider+'-auth-token';var cookieName='uppyAuthToken--'+provider;if(provider==='drive'||provider==='googledrive'){storageKey='companion-GoogleDrive-auth-token';cookieName='uppyAuthToken--googledrive';}if(provider==='onedrive'){storageKey='companion-OneDrive-auth-token';}try{window.localStorage.setItem(storageKey,token);}catch(_e){}document.cookie=cookieName+'='+encodeURIComponent(token)+'; Path=/; Max-Age=34560000; SameSite=Lax'+(config.secureCookie?'; Secure':'');}var data={token:token};var openerRef=null;try{openerRef=window.opener||null;}catch(_e){}if(!openerRef){window.location.replace(origin);return;}var attempts=0;var send=function(){attempts+=1;try{openerRef.postMessage(data,origin);}catch(_e){}if(attempts<5){setTimeout(send,150);return;}setTimeout(function(){try{window.close();}catch(_e){}},300);};send();})();</script>Completing sign in...</body></html>`;
}

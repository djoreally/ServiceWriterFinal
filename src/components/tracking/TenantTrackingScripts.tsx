import { useEffect } from "react";
import { fetchPublicTrackingSettings } from "@/application/queries/tracking-settings.query";

type TrackingEvent = "page_view" | "begin_checkout" | "purchase";

interface Props {
  userId?: string;
  event?: TrackingEvent;
  value?: number;
}

declare global {
  interface Window {
    __sw_tracking_loaded__?: Record<string, boolean>;
    dataLayer?: unknown[];
  }
}

function safeNumber(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function appendScript(
  parent: HTMLElement,
  opts: { src?: string; text?: string; async?: boolean; prepend?: boolean; id?: string },
) {
  // De-dupe by id so React re-renders / remounts never load the same tag twice.
  if (opts.id && document.getElementById(opts.id)) {
    return document.getElementById(opts.id) as HTMLScriptElement;
  }
  const s = document.createElement("script");
  if (opts.id) s.id = opts.id;
  if (opts.src) {
    s.src = opts.src;
    s.async = opts.async ?? true;
  } else if (opts.text) {
    s.text = opts.text;
  }
  if (opts.prepend && parent.firstChild) {
    parent.insertBefore(s, parent.firstChild);
  } else {
    parent.appendChild(s);
  }
  return s;
}

function injectInlineHtml(parent: HTMLElement, html: string) {
  // Server-side sanitized; render via a wrapper div, but extract <script> tags so they execute.
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  Array.from(wrapper.querySelectorAll("script")).forEach((old) => {
    appendScript(parent, { text: old.textContent ?? "", src: old.src || undefined });
    old.remove();
  });
  parent.appendChild(wrapper);
}

export function TenantTrackingScripts({ userId, event = "page_view", value }: Props): null {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const t = await fetchPublicTrackingSettings(userId);
      if (cancelled || !t?.enabled) return;

      window.__sw_tracking_loaded__ = window.__sw_tracking_loaded__ || {};
      const loadedKey = `${userId}`;
      const alreadyLoaded = window.__sw_tracking_loaded__[loadedKey];

      const v = safeNumber(value);

      // ---- Base tags (load once per tenant) ----
      if (!alreadyLoaded) {
        // GA4 — Google requires this immediately after <head>. We `prepend` so the
        // gtag.js loader and config land as the first two <script> tags in <head>.
        if (t.ga4_measurement_id) {
          // Insert in reverse order so the loader ends up FIRST after prepend.
          appendScript(document.head, {
            id: `sw-gtag-config-${t.ga4_measurement_id}`,
            text: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${t.ga4_measurement_id}');`,
            prepend: true,
          });
          appendScript(document.head, {
            id: `sw-gtag-loader-${t.ga4_measurement_id}`,
            src: `https://www.googletagmanager.com/gtag/js?id=${t.ga4_measurement_id}`,
            prepend: true,
          });
        }
        // Meta Pixel
        if (t.meta_pixel_id) {
          appendScript(document.head, {
            text: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${t.meta_pixel_id}');`,
          });
        }
        // Custom head/body (already DB-sanitized)
        if (t.custom_head_script) injectInlineHtml(document.head, t.custom_head_script);
        if (t.custom_body_script) injectInlineHtml(document.body, t.custom_body_script);

        window.__sw_tracking_loaded__[loadedKey] = true;
      }

      // ---- Per-page event ----
      const ga = t.ga4_measurement_id;
      const metaOn = !!t.meta_pixel_id;

      if (event === "page_view") {
        if (ga) appendScript(document.body, { text: `gtag('event','page_view');` });
        if (metaOn) appendScript(document.body, { text: `fbq('track','PageView');` });
      } else if (event === "begin_checkout") {
        if (ga) appendScript(document.body, { text: `gtag('event','begin_checkout',{value:${v},currency:'USD'});` });
        if (metaOn) appendScript(document.body, { text: `fbq('track','InitiateCheckout',{value:${v},currency:'USD'});` });
      } else if (event === "purchase") {
        if (ga) appendScript(document.body, { text: `gtag('event','purchase',{value:${v},currency:'USD'});` });
        if (ga && t.google_ads_id && t.google_ads_conversion_label) {
          appendScript(document.body, {
            text: `gtag('event','conversion',{'send_to':'${t.google_ads_id}/${t.google_ads_conversion_label}','value':${v},'currency':'USD'});`,
          });
        }
        if (metaOn) appendScript(document.body, { text: `fbq('track','Purchase',{value:${v},currency:'USD'});` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, event, value]);

  return null;
}

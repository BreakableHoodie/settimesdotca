import { onRequestGet as __api_admin_events__id__metrics_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/events/[id]/metrics.js"
import { onRequestGet as __api_admin_analytics_subscriptions_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/analytics/subscriptions.js"
import { onRequestPost as __api_admin_auth_login_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/auth/login.js"
import { onRequestPost as __api_admin_auth_reset_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/auth/reset.js"
import { onRequestPost as __api_admin_auth_signup_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/auth/signup.js"
import { onRequestPatch as __api_admin_bands_bulk_js_onRequestPatch } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/bands/bulk.js"
import { onRequestPost as __api_admin_bands_bulk_preview_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/bands/bulk-preview.js"
import { onRequestDelete as __api_admin_bands__id__js_onRequestDelete } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/bands/[id].js"
import { onRequestPut as __api_admin_bands__id__js_onRequestPut } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/bands/[id].js"
import { onRequestDelete as __api_admin_events__id__js_onRequestDelete } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/events/[id].js"
import { onRequestPost as __api_admin_events__id__js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/events/[id].js"
import { onRequestPut as __api_admin_events__id__js_onRequestPut } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/events/[id].js"
import { onRequestDelete as __api_admin_venues__id__js_onRequestDelete } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/venues/[id].js"
import { onRequestPut as __api_admin_venues__id__js_onRequestPut } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/venues/[id].js"
import { onRequestGet as __api_admin_bands_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/bands.js"
import { onRequestPost as __api_admin_bands_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/bands.js"
import { onRequestGet as __api_admin_events_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/events.js"
import { onRequestPost as __api_admin_events_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/events.js"
import { onRequestGet as __api_admin_venues_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/venues.js"
import { onRequestPost as __api_admin_venues_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/venues.js"
import { onRequestGet as __api_events_public_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/events/public.js"
import { onRequestGet as __api_feeds_ical_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/feeds/ical.js"
import { onRequestPost as __api_subscriptions_subscribe_js_onRequestPost } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/subscriptions/subscribe.js"
import { onRequestGet as __api_subscriptions_unsubscribe_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/subscriptions/unsubscribe.js"
import { onRequestGet as __api_subscriptions_verify_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/subscriptions/verify.js"
import { onRequestGet as __api_schedule_js_onRequestGet } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/schedule.js"
import { onRequest as __api_admin__middleware_js_onRequest } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/api/admin/_middleware.js"
import { onRequest as ___middleware_js_onRequest } from "/Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl/functions/_middleware.js"

export const routes = [
    {
      routePath: "/api/admin/events/:id/metrics",
      mountPath: "/api/admin/events/:id",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_events__id__metrics_js_onRequestGet],
    },
  {
      routePath: "/api/admin/analytics/subscriptions",
      mountPath: "/api/admin/analytics",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_analytics_subscriptions_js_onRequestGet],
    },
  {
      routePath: "/api/admin/auth/login",
      mountPath: "/api/admin/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_auth_login_js_onRequestPost],
    },
  {
      routePath: "/api/admin/auth/reset",
      mountPath: "/api/admin/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_auth_reset_js_onRequestPost],
    },
  {
      routePath: "/api/admin/auth/signup",
      mountPath: "/api/admin/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_auth_signup_js_onRequestPost],
    },
  {
      routePath: "/api/admin/bands/bulk",
      mountPath: "/api/admin/bands",
      method: "PATCH",
      middlewares: [],
      modules: [__api_admin_bands_bulk_js_onRequestPatch],
    },
  {
      routePath: "/api/admin/bands/bulk-preview",
      mountPath: "/api/admin/bands",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_bands_bulk_preview_js_onRequestPost],
    },
  {
      routePath: "/api/admin/bands/:id",
      mountPath: "/api/admin/bands",
      method: "DELETE",
      middlewares: [],
      modules: [__api_admin_bands__id__js_onRequestDelete],
    },
  {
      routePath: "/api/admin/bands/:id",
      mountPath: "/api/admin/bands",
      method: "PUT",
      middlewares: [],
      modules: [__api_admin_bands__id__js_onRequestPut],
    },
  {
      routePath: "/api/admin/events/:id",
      mountPath: "/api/admin/events",
      method: "DELETE",
      middlewares: [],
      modules: [__api_admin_events__id__js_onRequestDelete],
    },
  {
      routePath: "/api/admin/events/:id",
      mountPath: "/api/admin/events",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_events__id__js_onRequestPost],
    },
  {
      routePath: "/api/admin/events/:id",
      mountPath: "/api/admin/events",
      method: "PUT",
      middlewares: [],
      modules: [__api_admin_events__id__js_onRequestPut],
    },
  {
      routePath: "/api/admin/venues/:id",
      mountPath: "/api/admin/venues",
      method: "DELETE",
      middlewares: [],
      modules: [__api_admin_venues__id__js_onRequestDelete],
    },
  {
      routePath: "/api/admin/venues/:id",
      mountPath: "/api/admin/venues",
      method: "PUT",
      middlewares: [],
      modules: [__api_admin_venues__id__js_onRequestPut],
    },
  {
      routePath: "/api/admin/bands",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_bands_js_onRequestGet],
    },
  {
      routePath: "/api/admin/bands",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_bands_js_onRequestPost],
    },
  {
      routePath: "/api/admin/events",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_events_js_onRequestGet],
    },
  {
      routePath: "/api/admin/events",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_events_js_onRequestPost],
    },
  {
      routePath: "/api/admin/venues",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_venues_js_onRequestGet],
    },
  {
      routePath: "/api/admin/venues",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_venues_js_onRequestPost],
    },
  {
      routePath: "/api/events/public",
      mountPath: "/api/events",
      method: "GET",
      middlewares: [],
      modules: [__api_events_public_js_onRequestGet],
    },
  {
      routePath: "/api/feeds/ical",
      mountPath: "/api/feeds",
      method: "GET",
      middlewares: [],
      modules: [__api_feeds_ical_js_onRequestGet],
    },
  {
      routePath: "/api/subscriptions/subscribe",
      mountPath: "/api/subscriptions",
      method: "POST",
      middlewares: [],
      modules: [__api_subscriptions_subscribe_js_onRequestPost],
    },
  {
      routePath: "/api/subscriptions/unsubscribe",
      mountPath: "/api/subscriptions",
      method: "GET",
      middlewares: [],
      modules: [__api_subscriptions_unsubscribe_js_onRequestGet],
    },
  {
      routePath: "/api/subscriptions/verify",
      mountPath: "/api/subscriptions",
      method: "GET",
      middlewares: [],
      modules: [__api_subscriptions_verify_js_onRequestGet],
    },
  {
      routePath: "/api/schedule",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_schedule_js_onRequestGet],
    },
  {
      routePath: "/api/admin",
      mountPath: "/api/admin",
      method: "",
      middlewares: [__api_admin__middleware_js_onRequest],
      modules: [],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]
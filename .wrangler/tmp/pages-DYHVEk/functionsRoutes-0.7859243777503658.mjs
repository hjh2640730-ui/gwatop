import { onRequestGet as __api_admin_js_onRequestGet } from "/Users/jun/gwatop/functions/api/admin.js"
import { onRequestOptions as __api_admin_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/admin.js"
import { onRequestPost as __api_admin_js_onRequestPost } from "/Users/jun/gwatop/functions/api/admin.js"
import { onRequestGet as __api_alert_js_onRequestGet } from "/Users/jun/gwatop/functions/api/alert.js"
import { onRequestOptions as __api_alert_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/alert.js"
import { onRequestOptions as __api_attendance_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/attendance.js"
import { onRequestPost as __api_attendance_js_onRequestPost } from "/Users/jun/gwatop/functions/api/attendance.js"
import { onRequestOptions as __api_auth_social_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/auth-social.js"
import { onRequestPost as __api_auth_social_js_onRequestPost } from "/Users/jun/gwatop/functions/api/auth-social.js"
import { onRequestOptions as __api_claim_reward_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/claim-reward.js"
import { onRequestPost as __api_claim_reward_js_onRequestPost } from "/Users/jun/gwatop/functions/api/claim-reward.js"
import { onRequestGet as __api_cleanup_games_js_onRequestGet } from "/Users/jun/gwatop/functions/api/cleanup-games.js"
import { onRequestOptions as __api_cleanup_games_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/cleanup-games.js"
import { onRequestOptions as __api_comment_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/comment.js"
import { onRequestPost as __api_comment_js_onRequestPost } from "/Users/jun/gwatop/functions/api/comment.js"
import { onRequestOptions as __api_confirm_payment_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/confirm-payment.js"
import { onRequestPost as __api_confirm_payment_js_onRequestPost } from "/Users/jun/gwatop/functions/api/confirm-payment.js"
import { onRequestOptions as __api_delete_account_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/delete-account.js"
import { onRequestPost as __api_delete_account_js_onRequestPost } from "/Users/jun/gwatop/functions/api/delete-account.js"
import { onRequestOptions as __api_edit_post_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/edit-post.js"
import { onRequestPost as __api_edit_post_js_onRequestPost } from "/Users/jun/gwatop/functions/api/edit-post.js"
import { onRequestOptions as __api_game_rps_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/game-rps.js"
import { onRequestPost as __api_game_rps_js_onRequestPost } from "/Users/jun/gwatop/functions/api/game-rps.js"
import { onRequestGet as __api_generate_quiz_js_onRequestGet } from "/Users/jun/gwatop/functions/api/generate-quiz.js"
import { onRequestOptions as __api_generate_quiz_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/generate-quiz.js"
import { onRequestPost as __api_generate_quiz_js_onRequestPost } from "/Users/jun/gwatop/functions/api/generate-quiz.js"
import { onRequestOptions as __api_grade_short_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/grade-short.js"
import { onRequestPost as __api_grade_short_js_onRequestPost } from "/Users/jun/gwatop/functions/api/grade-short.js"
import { onRequestOptions as __api_index_post_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/index-post.js"
import { onRequestPost as __api_index_post_js_onRequestPost } from "/Users/jun/gwatop/functions/api/index-post.js"
import { onRequestOptions as __api_like_comment_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/like-comment.js"
import { onRequestPost as __api_like_comment_js_onRequestPost } from "/Users/jun/gwatop/functions/api/like-comment.js"
import { onRequestOptions as __api_like_post_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/like-post.js"
import { onRequestPost as __api_like_post_js_onRequestPost } from "/Users/jun/gwatop/functions/api/like-post.js"
import { onRequestGet as __api_monitor_js_onRequestGet } from "/Users/jun/gwatop/functions/api/monitor.js"
import { onRequestOptions as __api_monitor_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/monitor.js"
import { onRequestGet as __api_payment_history_js_onRequestGet } from "/Users/jun/gwatop/functions/api/payment-history.js"
import { onRequestOptions as __api_payment_history_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/payment-history.js"
import { onRequestOptions as __api_reindex_posts_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/reindex-posts.js"
import { onRequestPost as __api_reindex_posts_js_onRequestPost } from "/Users/jun/gwatop/functions/api/reindex-posts.js"
import { onRequestOptions as __api_send_message_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/send-message.js"
import { onRequestPost as __api_send_message_js_onRequestPost } from "/Users/jun/gwatop/functions/api/send-message.js"
import { onRequestOptions as __api_vote_js_onRequestOptions } from "/Users/jun/gwatop/functions/api/vote.js"
import { onRequestPost as __api_vote_js_onRequestPost } from "/Users/jun/gwatop/functions/api/vote.js"

export const routes = [
    {
      routePath: "/api/admin",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_js_onRequestGet],
    },
  {
      routePath: "/api/admin",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_admin_js_onRequestOptions],
    },
  {
      routePath: "/api/admin",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_js_onRequestPost],
    },
  {
      routePath: "/api/alert",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_alert_js_onRequestGet],
    },
  {
      routePath: "/api/alert",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_alert_js_onRequestOptions],
    },
  {
      routePath: "/api/attendance",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_attendance_js_onRequestOptions],
    },
  {
      routePath: "/api/attendance",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_attendance_js_onRequestPost],
    },
  {
      routePath: "/api/auth-social",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_auth_social_js_onRequestOptions],
    },
  {
      routePath: "/api/auth-social",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_social_js_onRequestPost],
    },
  {
      routePath: "/api/claim-reward",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_claim_reward_js_onRequestOptions],
    },
  {
      routePath: "/api/claim-reward",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_claim_reward_js_onRequestPost],
    },
  {
      routePath: "/api/cleanup-games",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_cleanup_games_js_onRequestGet],
    },
  {
      routePath: "/api/cleanup-games",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_cleanup_games_js_onRequestOptions],
    },
  {
      routePath: "/api/comment",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_comment_js_onRequestOptions],
    },
  {
      routePath: "/api/comment",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_comment_js_onRequestPost],
    },
  {
      routePath: "/api/confirm-payment",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_confirm_payment_js_onRequestOptions],
    },
  {
      routePath: "/api/confirm-payment",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_confirm_payment_js_onRequestPost],
    },
  {
      routePath: "/api/delete-account",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_delete_account_js_onRequestOptions],
    },
  {
      routePath: "/api/delete-account",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_delete_account_js_onRequestPost],
    },
  {
      routePath: "/api/edit-post",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_edit_post_js_onRequestOptions],
    },
  {
      routePath: "/api/edit-post",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_edit_post_js_onRequestPost],
    },
  {
      routePath: "/api/game-rps",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_game_rps_js_onRequestOptions],
    },
  {
      routePath: "/api/game-rps",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_game_rps_js_onRequestPost],
    },
  {
      routePath: "/api/generate-quiz",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_generate_quiz_js_onRequestGet],
    },
  {
      routePath: "/api/generate-quiz",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_generate_quiz_js_onRequestOptions],
    },
  {
      routePath: "/api/generate-quiz",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_generate_quiz_js_onRequestPost],
    },
  {
      routePath: "/api/grade-short",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_grade_short_js_onRequestOptions],
    },
  {
      routePath: "/api/grade-short",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_grade_short_js_onRequestPost],
    },
  {
      routePath: "/api/index-post",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_index_post_js_onRequestOptions],
    },
  {
      routePath: "/api/index-post",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_index_post_js_onRequestPost],
    },
  {
      routePath: "/api/like-comment",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_like_comment_js_onRequestOptions],
    },
  {
      routePath: "/api/like-comment",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_like_comment_js_onRequestPost],
    },
  {
      routePath: "/api/like-post",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_like_post_js_onRequestOptions],
    },
  {
      routePath: "/api/like-post",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_like_post_js_onRequestPost],
    },
  {
      routePath: "/api/monitor",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_monitor_js_onRequestGet],
    },
  {
      routePath: "/api/monitor",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_monitor_js_onRequestOptions],
    },
  {
      routePath: "/api/payment-history",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_payment_history_js_onRequestGet],
    },
  {
      routePath: "/api/payment-history",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_payment_history_js_onRequestOptions],
    },
  {
      routePath: "/api/reindex-posts",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_reindex_posts_js_onRequestOptions],
    },
  {
      routePath: "/api/reindex-posts",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_reindex_posts_js_onRequestPost],
    },
  {
      routePath: "/api/send-message",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_send_message_js_onRequestOptions],
    },
  {
      routePath: "/api/send-message",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_send_message_js_onRequestPost],
    },
  {
      routePath: "/api/vote",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_vote_js_onRequestOptions],
    },
  {
      routePath: "/api/vote",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_vote_js_onRequestPost],
    },
  ]
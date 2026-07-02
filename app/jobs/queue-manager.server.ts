/**
 * Queue Manager — exposes the OTP delivery queue for use inside the Remix server.
 *
 * The Remix server only produces jobs (via otpDeliveryQueue.add()). It never
 * runs a Worker — workers run in the separate `npm run worker` process.
 *
 * This module is the single import point for queue operations from within
 * Remix routes and services.
 */

export { otpDeliveryQueue } from "~/jobs/queues/otp-delivery.queue";

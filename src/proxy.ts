import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed middleware to proxy. With a src/ directory this file must
// live at src/proxy.ts — at the repo root it is silently ignored.
// /preview is the design preview: fixtures only, so it needs no session.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/preview"]);
const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  // API routes guard themselves with requireUserId() and answer 401 JSON.
  // Redirecting them here would hand fetch() an HTML sign-in page, which then
  // blows up on response.json() in the client.
  if (isApiRoute(request)) return;

  await auth.protect();
});

export const config = {
  matcher: [
    // Everything except Next internals and static files...
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // ...and always the API routes.
    "/(api|trpc)(.*)",
  ],
};

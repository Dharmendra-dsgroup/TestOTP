import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { shopService } from "~/services/shop.service";
import type { IShopDocument } from "~/models/shop.model";

export interface AdminAuthContext {
  shop: string;
  shopData: IShopDocument | null;
  session: Awaited<ReturnType<typeof authenticate.admin>>["session"];
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"];
}

/**
 * Authenticates an admin request and loads the shop record.
 * Throws a redirect to auth if the session is invalid.
 * Use this in every authenticated admin loader/action.
 */
export async function requireAdminAuth(
  args: LoaderFunctionArgs | ActionFunctionArgs
): Promise<AdminAuthContext> {
  const { session, admin } = await authenticate.admin(args.request);

  const shopResult = await shopService.getShopByDomain(session.shop);

  return {
    shop: session.shop,
    shopData: shopResult.data ?? null,
    session,
    admin,
  };
}

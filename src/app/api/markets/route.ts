import { handleMarkets } from "@/lib/api/markets";

export const GET = (request: Request) => handleMarkets(request);

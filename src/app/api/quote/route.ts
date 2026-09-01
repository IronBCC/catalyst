import { handleQuote } from "@/lib/api/quote";

export const GET = (request: Request) => handleQuote(request);

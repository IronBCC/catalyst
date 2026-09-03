import { handleGenerate } from "@/lib/api/generate";

export const maxDuration = 120;
export const POST = (request: Request) => handleGenerate(request);

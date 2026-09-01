import { handleGenerate } from "@/lib/api/generate";

export const maxDuration = 60;
export const POST = (request: Request) => handleGenerate(request);

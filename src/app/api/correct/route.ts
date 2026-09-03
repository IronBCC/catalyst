import { handleCorrect } from "@/lib/api/correct";

export const maxDuration = 120;
export const POST = (request: Request) => handleCorrect(request);

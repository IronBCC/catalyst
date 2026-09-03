import { handleCorrect } from "@/lib/api/correct";

export const maxDuration = 60;
export const POST = (request: Request) => handleCorrect(request);
